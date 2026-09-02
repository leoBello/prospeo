import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';
import {
  FENETRE_OBJECTIF_JOURS,
  construireJeu,
  type EntreesJeu,
  type FaitInteraction,
  type FaitPipeline,
  type Jeu,
  type Mesure,
} from '../domain/jeu.js';
import { fetchAllRows, type FetchAllOptions, type RangeReader } from './paginate.js';

/**
 * Lecteurs Supabase du jeu (D5).
 *
 * **Correctif de revue (second passage sur cette tâche).** La première
 * version lisait `pipeline_event` et `interaction` en ENTIER (pagination
 * complète, protégée par `hardLimit`) — un arbitrage a exclu cette lecture
 * intégrale à chaque chargement d'écran, même bien protégée. Trois natures
 * de faits coexistent désormais ici, chacune avec sa propre garantie :
 *
 * 1. **Les calculs à fenêtre** (`objectifDuJour`, `serieDeJours`, dans
 *    `domain/jeu.ts`) ne portent QUE sur les quatorze jours civils
 *    précédents (`FENETRE_OBJECTIF_JOURS`, défini dans le domaine — une
 *    seule source de vérité pour cette taille). `pipeline_event` et
 *    `interaction` sont donc lus bornés PAR DATE, pas en nombre de lignes :
 *    un plafond en lignes aurait pu couper la fenêtre en plein milieu d'une
 *    journée chargée (voir `MARGE_FUSEAU_JOURS` ci-dessous pour la marge
 *    appliquée à la coupure elle-même). La pagination (`fetchAllRows`) reste
 *    en place À L'INTÉRIEUR de cette fenêtre, comme garde-fou de volume, pas
 *    comme borne de fenêtre. **Second correctif de revue** : `pipeline_event`
 *    n'est plus filtré par un simple `gte('occurred_at', …)` — voir le
 *    docstring de `pipelineEventRangeReader` pour le trou de bord de fenêtre
 *    que cela laissait ouvert, et comment `.or(...)` le referme.
 *
 * 2. **Les cumuls qui ne doivent jamais régresser** (site mis en ligne,
 *    rendez-vous obtenu) viennent d'un `count` PostgREST
 *    (`select('*', { count: 'exact', head: true })`) : un NOMBRE, sans
 *    transférer une seule ligne, sur TOUTE la durée de vie de la table. Un
 *    `count` ne peut pas mentir par troncature — il n'y a rien à tronquer,
 *    la réponse est déjà un scalaire — et il ne peut que croître tant que la
 *    table ne connaît pas de suppression.
 *
 * 3. **« Relance tenue » cumulée, depuis toujours, ne peut PAS venir d'un
 *    `count`** : c'est un croisement de DEUX tables
 *    (`pipeline_event.next_action_at` × `interaction.occurred_at`) que
 *    PostgREST ne réduit à aucun total serveur — il faudrait une vue ou une
 *    fonction SQL, une migration de plus sur une base réelle, décision hors
 *    du périmètre de cette tâche (signalée, pas tranchée ici). Ce fichier
 *    fournit donc honnêtement `{ connue: false }` pour ce cumul précis — voir
 *    `RELANCES_TENUES_CUMULEES` et le docstring de `calculerPalier`
 *    (domain/jeu.ts) pour ce que cela implique pour le palier et les badges.
 *
 * Aucune règle du jeu n'est décidée ici, seulement la mise en forme et le
 * découpage des lectures — le calcul reste entièrement dans
 * `construireJeu` (tâche 6).
 */

type Client = SupabaseClient<Database>;

const STATUTS_PIPELINE: readonly Enums<'pipeline_status'>[] = [
  'a_contacter',
  'contacte',
  'relance',
  'interesse',
  'gagne',
  'perdu',
  'ne_pas_contacter',
];

const ORIGINES_PIPELINE: readonly Enums<'pipeline_event_origin'>[] = ['observe', 'amorcage'];

function texte(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function ligne(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Les lignes `pipeline_event` brutes en `FaitPipeline`.
 *
 * Un `status` ou un `origin` hors énumération est écarté plutôt que forcé —
 * même doctrine que `toDeploymentEvents` (`data/deployments.ts`) : un jeton
 * que la base ne nomme pas ne doit peser sur aucun calcul. `next_action_at`
 * passe tel quel, `null` compris : c'est une échéance absente, pas une valeur
 * à combler (voir le docstring de `FaitPipeline`, `domain/jeu.ts`).
 */
export function toFaitsPipeline(raw: unknown): FaitPipeline[] {
  if (!Array.isArray(raw)) return [];
  const faits: FaitPipeline[] = [];
  for (const brut of raw) {
    const o = ligne(brut);
    if (o === null) continue;
    const prospectId = texte(o['prospect_id']);
    const status = o['status'];
    const origin = o['origin'];
    const occurredAt = texte(o['occurred_at']);
    if (prospectId === null) continue;
    if (!STATUTS_PIPELINE.includes(status as Enums<'pipeline_status'>)) continue;
    if (!ORIGINES_PIPELINE.includes(origin as Enums<'pipeline_event_origin'>)) continue;
    if (occurredAt === null) continue;
    faits.push({
      prospectId,
      status: status as Enums<'pipeline_status'>,
      nextActionAt: texte(o['next_action_at']),
      origin: origin as Enums<'pipeline_event_origin'>,
      occurredAt,
    });
  }
  return faits;
}

/** Les lignes `interaction` brutes en `FaitInteraction` — seuls `prospect_id` et `occurred_at` comptent pour le jeu (voir `FaitInteraction`, `domain/jeu.ts`). */
export function toFaitsInteraction(raw: unknown): FaitInteraction[] {
  if (!Array.isArray(raw)) return [];
  const faits: FaitInteraction[] = [];
  for (const brut of raw) {
    const o = ligne(brut);
    if (o === null) continue;
    const prospectId = texte(o['prospect_id']);
    const occurredAt = texte(o['occurred_at']);
    if (prospectId === null || occurredAt === null) continue;
    faits.push({ prospectId, occurredAt });
  }
  return faits;
}

/**
 * Marge de sécurité, en jours, ajoutée à `FENETRE_OBJECTIF_JOURS` pour fixer
 * la date de coupure des deux lectures bornées.
 *
 * `domain/jeu.ts` (`joursCivils`) raisonne en dates de calendrier LOCALES ;
 * la coupure posée ici porte sur `occurred_at`, une colonne `timestamptz`
 * comparée en UTC côté serveur. Sans marge, une ligne du 14ᵉ jour pourrait
 * tomber, de justesse, du mauvais côté de la coupure UTC selon le fuseau de
 * la machine qui a écrit la ligne — amputant la fenêtre d'un jour en
 * silence, exactement ce que cette lecture doit éviter. Un jour de marge
 * absorbe tout décalage de fuseau raisonnable ; les lignes surnuméraires
 * que ça ramène ne faussent rien, puisque `objectifDuJour`/`serieDeJours`
 * rejettent déjà, par leur propre décalage en jours, tout ce qui dépasse
 * `FENETRE_OBJECTIF_JOURS`.
 */
const MARGE_FUSEAU_JOURS = 1;

/** La date de coupure ISO des lectures bornées — voir `MARGE_FUSEAU_JOURS`. */
function coupureFenetre(maintenant: Date): string {
  const coupure = new Date(maintenant);
  coupure.setDate(coupure.getDate() - (FENETRE_OBJECTIF_JOURS + MARGE_FUSEAU_JOURS));
  return coupure.toISOString();
}

/**
 * Construit le lecteur de tranches de `pipeline_event`, borné par date à la
 * fenêtre du jeu — voir le docstring de ce fichier et `coupureFenetre`.
 * `order('id', …)` : la clé primaire donne un ordre total et déterministe à
 * l'intérieur de cette fenêtre, seule garantie que la pagination ne relise
 * ni ne saute une ligne — même raison que `prospectRangeReader`
 * (`data/queries.ts`).
 *
 * **Le filtre `.or(...)`, et pourquoi une seule coupure ne suffit pas ici.**
 * Une échéance (`next_action_at`) peut avoir été POSÉE bien avant le début de
 * la fenêtre tout en restant DUE dedans — une relance rare, décidée il y a
 * longtemps pour une date proche. Un simple `gte('occurred_at', coupure)`
 * (comme sur `interaction`, qui n'a pas ce problème : une interaction ne
 * peut honorer qu'une échéance dont elle connaît déjà la pose) manquerait
 * cette ligne, et `relancesTenues` (domain/jeu.ts) sous-compterait une
 * relance pourtant réellement honorée dans la fenêtre — une régression que
 * la lecture intégrale d'origine ne pouvait pas avoir. Le filtre retient donc
 * une ligne dès que SON OCCURRENCE **ou** SON ÉCHÉANCE tombe dans la
 * fenêtre : la borne reste une borne (aucune ligne dont les deux dates sont
 * antérieures à la coupure n'est jamais lue), mais elle ne coupe plus
 * silencieusement une échéance encore pertinente.
 */
export function pipelineEventRangeReader(client: Client, coupureISO: string): RangeReader<unknown> {
  const coupureDate = coupureISO.slice(0, 10); // `next_action_at` est une colonne `date`, pas `timestamptz` — voir FaitPipeline.
  return (from, to) =>
    client
      .from('pipeline_event')
      .select('prospect_id,status,next_action_at,origin,occurred_at')
      .or(`occurred_at.gte.${coupureISO},next_action_at.gte.${coupureDate}`)
      .order('id', { ascending: true })
      .range(from, to) as unknown as ReturnType<RangeReader<unknown>>;
}

/** Même raison que `pipelineEventRangeReader` ci-dessus. */
export function interactionRangeReader(client: Client, coupureISO: string): RangeReader<unknown> {
  return (from, to) =>
    client
      .from('interaction')
      .select('prospect_id,occurred_at')
      .gte('occurred_at', coupureISO)
      .order('id', { ascending: true })
      .range(from, to) as unknown as ReturnType<RangeReader<unknown>>;
}

/**
 * Lit un `count` PostgREST et le nomme dans l'erreur qu'il peut lever — même
 * raison que `lireTable` ci-dessous pour les lectures de lignes. `nom` doit
 * distinguer les DEUX comptes posés sur `pipeline_event`
 * (`compterRendezVousObtenus`, `historiqueAuDelaDeLaFenetre`) : les nommer
 * tous les deux `'pipeline_event'` rendrait un échec de l'un indiscernable
 * de l'échec de l'autre, alors que ce nom est précisément ce qui permet de
 * désigner la source d'un échec.
 */
async function lireCompte(
  nom: string,
  requete: PromiseLike<{ count: number | null; error: { message: string } | null }>,
): Promise<number> {
  const { count, error } = await requete;
  if (error !== null) {
    throw new Error(`${nom} : lecture impossible — ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Le nombre de sites mis en ligne DEPUIS TOUJOURS.
 *
 * **Lu sur `prospect_site`, et non sur `deployment_event`** — c'est une
 * correction, et elle mérite son explication.
 *
 * Le plan tenait cette source pour « débloquée par le lot 2 », qui a créé
 * `deployment_event` et son couple `en_ligne`/`reussi`. C'est vrai du
 * schéma et faux des données : cette table ne se remplit qu'aux passages du
 * collector, et **tout ce qui a été publié avant sa création n'y figure
 * pas**. Le handoff du lot 2 le disait déjà des sites vivants — « ils n'ont
 * aucun événement » — mais le jeu, lui, a quand même compté depuis là. Un
 * site réellement en ligne rapportait donc zéro point, sous une bande qui
 * annonce « +120 pts · site mis en ligne » : exactement l'affordance qui
 * promet un fait qu'aucun code ne rend vrai.
 *
 * `prospect_site` porte l'état, une ligne par prospect, et sait pour TOUS
 * les sites — ceux d'avant la table d'événements comme ceux d'après. Compter
 * ici évite au passage le double comptage qu'un cumul des deux sources
 * produirait sur les sites à venir.
 *
 * **`published_at` non nul, sans regarder `unpublished_at`** : le jalon est
 * « avoir mis un site en ligne », pas « en avoir un en ligne maintenant ».
 * Un retrait — un refus, ou la péremption à 90 jours du chantier n°4 — ne
 * défait pas le travail accompli, et le compter ferait **régresser** le
 * palier et reverrouiller un badge acquis, ce que la doctrine du jeu
 * interdit. `unpublish` n'efface d'ailleurs jamais `published_at`
 * (`collector/src/cli.ts`, il n'écrit que `unpublished_at`), donc ce compte
 * ne peut que croître.
 */
async function compterSitesMisEnLigne(client: Client): Promise<number> {
  return lireCompte(
    'prospect_site (sites mis en ligne)',
    client.from('prospect_site').select('*', { count: 'exact', head: true }).not('published_at', 'is', null),
  );
}

/**
 * Le nombre de rendez-vous obtenus DEPUIS TOUJOURS — chaque ligne
 * `pipeline_event` OBSERVÉE portant le statut `interesse` (voir le docstring
 * de l'ex-`rendezVousObtenus`, retiré de `domain/jeu.ts` : ce comptage ne
 * nécessite plus de lire la moindre ligne).
 */
async function compterRendezVousObtenus(client: Client): Promise<number> {
  return lireCompte(
    'pipeline_event (rendez-vous obtenus)',
    client.from('pipeline_event').select('*', { count: 'exact', head: true }).eq('status', 'interesse').eq('origin', 'observe'),
  );
}

/**
 * Existe-t-il, dans `pipeline_event`, une ligne OBSERVÉE antérieure à la
 * coupure de la fenêtre ? Un `count` suffit (`> 0`) — voir le docstring
 * d'`objectifDuJour` (domain/jeu.ts) pour ce que ce booléen lui permet de
 * décider sans avoir à relire l'historique complet.
 */
async function historiqueAuDelaDeLaFenetre(client: Client, coupureISO: string): Promise<boolean> {
  const n = await lireCompte(
    'pipeline_event (historique au-delà de la fenêtre)',
    client.from('pipeline_event').select('*', { count: 'exact', head: true }).eq('origin', 'observe').lt('occurred_at', coupureISO),
  );
  return n > 0;
}

/**
 * Lit une table paginée en la nommant dans l'erreur qu'elle peut lever.
 *
 * `fetchAllRows` échoue déjà avec un message utile (ligne atteinte, cause) —
 * mais ce message ne dit pas DE QUELLE table il vient, puisque `fetchAllRows`
 * est générique.
 */
async function lireTable(nom: string, lecteur: RangeReader<unknown>, options?: FetchAllOptions): Promise<unknown[]> {
  try {
    return await fetchAllRows(lecteur, options);
  } catch (cause) {
    throw new Error(`${nom} : lecture impossible — ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/**
 * Voir le point 3 du docstring de ce fichier : aucune requête PostgREST ne
 * réduit à un `count` un croisement de deux tables. Constante plutôt que
 * literal recopié, pour qu'un futur retrait (le jour où une vue ou fonction
 * SQL fournira un cumul honnête) n'ait qu'un seul endroit à changer.
 */
const RELANCES_TENUES_CUMULEES: Mesure<number> = { connue: false };

/**
 * Lit les cinq sources brutes du jeu et les rend dans la forme que
 * `domain/jeu.ts` attend (`EntreesJeu`) — voir le docstring du fichier pour
 * la nature de chacune.
 */
export async function fetchEntreesJeu(
  client: Client,
  now: Date = new Date(),
  options?: FetchAllOptions,
): Promise<EntreesJeu> {
  const coupureISO = coupureFenetre(now);
  const [pipelineRaw, interactionRaw, auDela, nombreSitesMisEnLigne, nombreRendezVousObtenus] = await Promise.all([
    lireTable('pipeline_event', pipelineEventRangeReader(client, coupureISO), options),
    lireTable('interaction', interactionRangeReader(client, coupureISO), options),
    historiqueAuDelaDeLaFenetre(client, coupureISO),
    compterSitesMisEnLigne(client),
    compterRendezVousObtenus(client),
  ]);
  return {
    maintenant: now,
    evenementsPipeline: toFaitsPipeline(pipelineRaw),
    interactions: toFaitsInteraction(interactionRaw),
    historiqueAuDelaDeLaFenetre: auDela,
    relancesTenuesCumulees: RELANCES_TENUES_CUMULEES,
    nombreSitesMisEnLigne,
    nombreRendezVousObtenus,
  };
}

/**
 * Lit les cinq sources ET assemble le jeu — ce que `useJeu` (le hook)
 * consomme directement. Simple composition, comme `fetchDeployments`
 * (`data/deployments.ts`) compose ses lectures et `etatDepuisEvenements` :
 * aucune règle nouvelle, `construireJeu` reste l'unique décideur.
 */
export async function fetchJeu(client: Client, now: Date = new Date(), options?: FetchAllOptions): Promise<Jeu> {
  const entrees = await fetchEntreesJeu(client, now, options);
  return construireJeu(entrees);
}
