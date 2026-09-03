import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';

/**
 * Les trois écritures du dashboard — ses premières.
 *
 * Jusqu'ici cet écran ne faisait que lire, et `prospect_pipeline` comme
 * `interaction` attendaient leur premier écrivain depuis le socle. Ce fichier
 * le leur donne.
 *
 * **Ce que le dashboard ne peut PAS faire, et pourquoi.** Il tourne dans un
 * navigateur, avec la clé anonyme : tout ce qu'il connaît part dans le bundle
 * public. Il ne peut donc porter ni le jeton Vercel, ni le jeton GitHub, ni la
 * clé Anthropic. Passer un prospect à `ne_pas_contacter` change donc le
 * STATUT, et rien d'autre — c'est `unpublish`, côté collector, qui retire
 * ensuite le site. L'interface doit le dire, faute de quoi l'opérateur croira
 * la page retirée alors qu'elle est toujours servie au nom de quelqu'un qui
 * vient de refuser.
 *
 * Chaque fonction rend `null` en cas de succès et le message d'erreur sinon.
 * Une exception obligerait chaque appelant à un `try` ; une valeur de retour
 * se traite là où l'on sait quoi en afficher.
 */

/** Client typé sur le schéma, tel que le fournit `AuthProvider`. */
type Client = SupabaseClient<Database>;

/**
 * Refuse la rédaction d'un prospect.
 *
 * **Un horodatage, pas un effacement.** Le contenu reste lisible — on doit
 * pouvoir regarder CE QU'ON A REFUSÉ pour corriger le prompt, plutôt que de
 * retirer la même chose au hasard au tour suivant. Et l'effacer détruirait, en
 * un clic, la seule copie d'un texte qui est peut-être déjà publié sous le nom
 * d'une entreprise réelle.
 *
 * Deux étages du collector lisent cette date : `publish` refuse de pousser un
 * contenu rejeté, `generate` le reprend sans qu'il faille penser à `--force`.
 * Sans ce couplage, le bouton n'aurait servi à rien tout en laissant croire le
 * contraire.
 */
export async function rejeterRedaction(client: Client, prospectId: string): Promise<string | null> {
  const { error } = await client
    .from('prospect_site')
    .update({ content_rejected_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('prospect_id', prospectId);
  return error === null ? null : error.message;
}

/**
 * Annule un refus.
 *
 * Le geste inverse doit exister : un refus est un clic, et un clic se fait par
 * erreur. Sans lui, la seule façon de revenir en arrière serait de régénérer —
 * donc de payer un appel pour défaire une maladresse, et de perdre au passage
 * le texte qu'on voulait garder.
 */
export async function annulerRejet(client: Client, prospectId: string): Promise<string | null> {
  const { error } = await client
    .from('prospect_site')
    .update({ content_rejected_at: null, updated_at: new Date().toISOString() })
    .eq('prospect_id', prospectId);
  return error === null ? null : error.message;
}

/**
 * L'issue de `definirStatut` : `null` en cas de succès total, sinon LAQUELLE
 * des deux écritures a échoué, et le message brut de Supabase pour celle-là.
 *
 * Une chaîne composée par l'application (par ex. `pipeline_event: …`) serait
 * un texte d'INTERFACE écrit en dur — c'est l'application qui le rédigerait,
 * en anglais, pour porter une information au lecteur, exactement ce que ce
 * fichier ne fait nulle part ailleurs (relevé de revue). Sa seule exception
 * documentée est de RELAYER le message brut d'une erreur externe, jamais
 * d'en composer un nouveau. `etape` donne donc à l'appelant, sous forme de
 * donnée, ce qu'une chaîne composée lui aurait donné sous forme de texte —
 * charge à lui de la traduire avec une clé `t()` dédiée.
 */
export type EchecDefinirStatut = {
  readonly etape: 'etat' | 'historique';
  readonly message: string;
};

/**
 * Fixe le statut d'un prospect dans le pipeline, ET consigne le changement
 * dans `pipeline_event` (tâche 4) — la seule matière que `domain/jeu.ts`
 * (tâche 6) peut lire pour dater un rendez-vous obtenu ou une relance tenue.
 * Sans cette seconde écriture, la table resterait vide pour toujours et le
 * jeu ne lirait jamais que zéro.
 *
 * `upsert` et non `update` sur `prospect_pipeline` : la table est VIDE —
 * aucune ligne n'existe pour aucun prospect au 2 septembre 2026, faute
 * d'écrivain. Un `update` ne toucherait donc rien, sans erreur, et le premier
 * clic sur chaque prospect serait silencieusement perdu.
 *
 * **Deux écritures, aucune transaction.** Le client Supabase (clé anonyme,
 * navigateur) n'en offre pas : il faut donc décider d'un ordre et d'un sort
 * pour l'échec partiel, plutôt que les laisser diverger en silence — le pire
 * des trois résultats possibles (voir l'en-tête du fichier).
 *
 * **Ordre retenu : l'état (`prospect_pipeline`) d'abord, l'historique
 * (`pipeline_event`) ensuite.**
 * - L'état est ce que lit tout le reste de l'écran — la fiche, les colonnes,
 *   les files de relance. Le faire réussir en premier garantit qu'aucune
 *   ligne d'historique ne peut jamais affirmer une transition que la fiche
 *   ne montre pas : c'est l'ORDRE INVERSE qui aurait pu faire mentir la
 *   fiche (une ligne d'historique posée, puis l'état resté à l'ancien).
 * - L'`upsert` est de plus IDEMPOTENT (`onConflict: 'prospect_id'`) : un
 *   opérateur qui retente le même geste après un échec de l'historique ne
 *   fait que réécrire le même état. L'`insert` de `pipeline_event`, lui,
 *   EMPILE — le rejouer après un vrai succès créerait un doublon. Faire
 *   réussir l'idempotent en premier limite donc le risque de doublon à la
 *   seule écriture qu'on choisit de rejouer.
 *
 * **Si le premier échoue** (l'état) : l'historique n'est PAS tenté. Rien n'a
 * changé nulle part — ce n'est pas un échec partiel mais un échec net, rendu
 * tel quel (`{ etape: 'etat', message }`, le message brut de Supabase comme
 * les autres fonctions de ce fichier).
 *
 * **Si le second échoue** (l'historique, une fois l'état déjà écrit) : le
 * geste de l'opérateur A PRIS, contrairement à ce qu'un message d'erreur nu
 * lui ferait croire. L'avaler ferait dériver le jeu en silence (un
 * rendez-vous ou une relance qui n'existera jamais) ; le confondre avec un
 * échec de l'état pousserait à réessayer sans nécessité, ou à douter d'un
 * changement qui a pourtant eu lieu. `{ etape: 'historique', message }`
 * porte donc cette distinction à l'appelant. C'est aussi lui — `ui/actions.ts`
 * — qui doit alors RELIRE malgré l'échec : l'état a changé, la fiche ne doit
 * pas rester sur l'ancien statut.
 */
export async function definirStatut(
  client: Client,
  prospectId: string,
  status: Enums<'pipeline_status'>,
  nextActionAt: string | null,
): Promise<EchecDefinirStatut | null> {
  const { error } = await client.from('prospect_pipeline').upsert(
    {
      prospect_id: prospectId,
      status,
      next_action_at: nextActionAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prospect_id' },
  );
  if (error !== null) return { etape: 'etat', message: error.message };

  const { error: erreurHistorique } = await client.from('pipeline_event').insert({
    prospect_id: prospectId,
    status,
    // La date qui ENTRE EN VIGUEUR avec CE changement précis, et non celle
    // qui l'a précédé — voir `FaitPipeline.nextActionAt` dans `domain/jeu.ts`.
    next_action_at: nextActionAt,
    // 'observe' est déjà le défaut de la colonne ; l'écrire explicitement
    // rend l'invariant vérifiable ici même si ce défaut venait à changer, et
    // affirme noir sur blanc qu'une écriture réelle n'est JAMAIS un
    // 'amorcage' — la valeur que seule la migration de la tâche 4 a posée,
    // une fois, pour reconstituer un historique qui n'existait pas.
    origin: 'observe',
    // `occurred_at` reste au défaut de la base (`now()`), comme dans
    // `journaliserInteraction` : l'écrire ici exposerait l'horloge du poste.
  });
  if (erreurHistorique !== null) return { etape: 'historique', message: erreurHistorique.message };

  return null;
}

/**
 * Consigne un échange dans le journal.
 *
 * `insert` et non `upsert` : un journal empile. Deux appels le même jour sont
 * deux faits, pas une correction du premier — et c'est précisément la
 * chronologie qui permettra de dire, dans six mois, ce qu'on a réellement
 * tenté avant de classer un prospect perdu.
 *
 * `occurred_at` est laissé à son défaut : la base horodate au moment de
 * l'écriture. Le renseigner ici depuis le navigateur exposerait l'horloge du
 * poste, qui peut être décalée de plusieurs minutes, et ferait apparaître des
 * échanges dans le désordre.
 */
/**
 * Désigne (ou efface) le gabarit actif (chantier n°10, D10).
 *
 * **`update`, jamais `insert`.** `site_template` est une table à ligne
 * unique (tâche 2) : sa ligne `id = 1` est créée dès la migration, avec
 * `repo_full_name` nul. Un `insert` violerait la contrainte
 * `site_template_singleton` dès la première désignation — contrairement à
 * `definirStatut` ci-dessus, dont la table est vide et exige un `upsert`.
 *
 * **Un champ vidé au clavier normalise en `null`.** `fetchSiteTemplate` a dû
 * apprendre à distinguer `''` d'un `null` en lecture (tâche 6) précisément
 * parce que le côté écriture ne le garantissait pas ; cette fonction ferme la
 * boucle en écrivant `null` pour un dépôt vide ou fait uniquement d'espaces,
 * plutôt que de laisser passer une chaîne vide qui se lirait, plus tard,
 * comme une désignation.
 *
 * **Ce que cette fonction ne fait pas** : elle ne PRODUIT jamais de verdict —
 * `checked_at` / `check_ok` / `check_detail` restent l'affaire du collector,
 * seul à porter le jeton GitHub qu'un contrôle exige. Mais elle les EFFACE :
 * relevé de revue (tâche 10), une désignation qui laissait ces trois colonnes
 * intactes faisait porter au NOUVEAU dépôt le verdict de l'ANCIEN — la carte
 * pouvait afficher « Contrôle réussi le … » pour un dépôt jamais contrôlé une
 * seule fois. Les mettre à `null` dans le même `UPDATE` restaure l'état
 * honnête — « pas encore contrôlé » — jusqu'au prochain passage du collector.
 */
export async function designerGabarit(
  client: Client,
  repoFullName: string | null,
  branch: string,
): Promise<string | null> {
  const repo = repoFullName?.trim();
  const brancheNormalisee = branch.trim();
  const { error } = await client
    .from('site_template')
    .update({
      repo_full_name: repo === undefined || repo === '' ? null : repo,
      branch: brancheNormalisee === '' ? 'main' : brancheNormalisee,
      checked_at: null,
      check_ok: null,
      check_detail: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1);
  return error === null ? null : error.message;
}

export async function journaliserInteraction(
  client: Client,
  prospectId: string,
  kind: Enums<'interaction_kind'>,
  body: string | null,
): Promise<string | null> {
  const { error } = await client.from('interaction').insert({
    prospect_id: prospectId,
    kind,
    // Une chaîne vide n'est pas une note : elle occuperait une ligne du
    // journal sans rien y dire.
    body: body === null || body.trim() === '' ? null : body.trim(),
  });
  return error === null ? null : error.message;
}

/**
 * Code Postgres d'une violation de contrainte d'unicité.
 *
 * Nommé plutôt qu'écrit en clair au point d'usage : `'23505'` ne dit rien à
 * qui relit, et c'est précisément le code dont dépend la décision de traiter
 * un refus comme un succès.
 */
const VIOLATION_UNICITE = '23505';

/**
 * Dépose une demande de traitement pour un prospect.
 *
 * **C'est tout le contrat de l'écran côté déclenchement.** Le dashboard
 * n'appelle ni GitHub ni Vercel — ce sont des secrets, et l'architecture du
 * chantier n°1 n'a pas de backend : il écrit une ligne, et le collector
 * résident la prend. Ce contrat resterait vrai si un backend remplaçait un
 * jour le worker, et l'interface n'aurait pas à changer.
 *
 * **Une violation d'unicité n'est pas une erreur.** L'index partiel
 * `campaign_job_actif_unique` refuse un second job actif sur le même
 * prospect ; c'est la garantie qui joue son rôle, et l'écran affiche déjà
 * « en file d'attente ». Remonter une erreur ferait recliquer sur une
 * demande déjà déposée, ou pire, croire à une panne.
 *
 * **`utilisateurId` est fourni par l'appelant, pas relu ici.** La politique
 * `proprietaire_seul` de `campaign_job` (chantier n°8) filtre sur
 * `requested_by = auth.uid()` : sans cette colonne, l'insertion est refusée
 * par la RLS — c'est ce qui a cassé le bouton « Déployer ». Un
 * `client.auth.getUser()` à chaque appel aurait évité de toucher les
 * appelants, mais aurait payé un aller-retour réseau par clic et rendu cette
 * fonction impossible à tester sans simuler l'authentification ; `App.tsx`
 * tient déjà la session (`useAuth`), et n'a qu'à la transmettre.
 */
export async function deposerJob(
  client: Client,
  prospectId: string,
  utilisateurId: string,
): Promise<string | null> {
  const { error } = await client
    .from('campaign_job')
    .insert({ prospect_id: prospectId, kind: 'chaine', state: 'en_attente', requested_by: utilisateurId });

  if (error === null) return null;
  if (error.code === VIOLATION_UNICITE) return null;
  return error.message;
}

/**
 * Retire une demande **encore en attente**.
 *
 * Le second filtre sur l'état n'est pas une précaution de style : un job déjà
 * pris par le worker ne se retire pas depuis l'interface. Le dépôt GitHub est
 * peut-être créé, le projet Vercel amorcé — annuler la ligne ferait mentir
 * l'écran sur ce qui existe réellement au nom d'une entreprise.
 *
 * `annule` et non une suppression : ce qu'on a demandé, puis retiré, fait
 * partie de ce qu'on doit pouvoir relire. C'est aussi un état terminal, donc
 * invisible des lectures de l'écran.
 *
 * **N'écrit pas `requested_by`, et n'en a pas besoin.** `proprietaire_seul`
 * s'applique aussi à cet `update` (`using` ET `with check`), mais la colonne
 * n'est pas modifiée par cette écriture : une fois `deposerJob` corrigé, la
 * ligne visée porte déjà le bon `requested_by`, et `using` la laisse passer
 * pour son propriétaire sans qu'il faille la réécrire ici.
 */
export async function retirerJob(client: Client, prospectId: string): Promise<string | null> {
  const { error } = await client
    .from('campaign_job')
    .update({ state: 'annule', finished_at: new Date().toISOString() })
    .eq('prospect_id', prospectId)
    .eq('state', 'en_attente');

  return error === null ? null : error.message;
}
