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
 *    `interaction` sont donc lus bornés PAR DATE (`gte('occurred_at', …)`),
 *    pas en nombre de lignes : un plafond en lignes aurait pu couper la
 *    fenêtre en plein milieu d'une journée chargée (voir `MARGE_FUSEAU_JOURS`
 *    ci-dessous pour la marge appliquée à la coupure elle-même). La
 *    pagination (`fetchAllRows`) reste en place À L'INTÉRIEUR de cette
 *    fenêtre, comme garde-fou de volume, pas comme borne de fenêtre.
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
 */
export function pipelineEventRangeReader(client: Client, coupureISO: string): RangeReader<unknown> {
  return (from, to) =>
    client
      .from('pipeline_event')
      .select('prospect_id,status,next_action_at,origin,occurred_at')
      .gte('occurred_at', coupureISO)
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

/** Lit un `count` PostgREST et le nomme dans l'erreur qu'il peut lever — même raison que `lireTable` ci-dessous pour les lectures de lignes. */
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
 * Le nombre de sites mis en ligne DEPUIS TOUJOURS — `step: 'en_ligne'` **et**
 * `outcome: 'reussi'` (l'énoncé de la tâche), traduit en clause `.eq` plutôt
 * que rejoué en mémoire. Un `count`, jamais une ligne transférée : voir le
 * docstring du fichier.
 */
async function compterSitesMisEnLigne(client: Client): Promise<number> {
  return lireCompte(
    'deployment_event',
    client.from('deployment_event').select('*', { count: 'exact', head: true }).eq('step', 'en_ligne').eq('outcome', 'reussi'),
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
    'pipeline_event',
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
    'pipeline_event',
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
