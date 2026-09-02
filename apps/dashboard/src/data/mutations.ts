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
 * Fixe le statut d'un prospect dans le pipeline.
 *
 * `upsert` et non `update` : la table est VIDE — aucune ligne n'existe pour
 * aucun prospect au 2 septembre 2026, faute d'écrivain. Un `update` ne
 * toucherait donc rien, sans erreur, et le premier clic sur chaque prospect
 * serait silencieusement perdu.
 */
export async function definirStatut(
  client: Client,
  prospectId: string,
  status: Enums<'pipeline_status'>,
  nextActionAt: string | null,
): Promise<string | null> {
  const { error } = await client.from('prospect_pipeline').upsert(
    {
      prospect_id: prospectId,
      status,
      next_action_at: nextActionAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'prospect_id' },
  );
  return error === null ? null : error.message;
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
