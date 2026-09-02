import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';
import {
  construireJeu,
  type EntreesJeu,
  type FaitInteraction,
  type FaitMiseEnLigne,
  type FaitPipeline,
  type Jeu,
} from '../domain/jeu.js';
import { fetchAllRows, type FetchAllOptions, type RangeReader } from './paginate.js';

/**
 * Lecteurs Supabase du jeu (D5).
 *
 * Même partage des rôles qu'entre `data/deployments.ts` et `domain/deployment.ts` :
 * aucune règle du jeu n'est décidée ici, seulement la mise en forme des trois
 * sources que `domain/jeu.ts` réclame — `pipeline_event`, `interaction`, et
 * `deployment_event` filtré sur « site mis en ligne ». Le calcul reste dans
 * `construireJeu` (tâche 6) ; ce fichier se contente de l'appeler une fois les
 * faits en main, comme `toDeploymentView` appelle `etatDepuisEvenements`.
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
 * Les lignes `deployment_event` déjà filtrées (`step: 'en_ligne'`,
 * `outcome: 'reussi'`) en `FaitMiseEnLigne`.
 *
 * Le filtre est posé côté serveur par `sitesMisEnLigneRangeReader` — cette
 * fonction ne revalide pas `step`/`outcome` : ce ne sont plus des colonnes de
 * sortie (voir le docstring de `FaitMiseEnLigne`, `domain/jeu.ts`), seule leur
 * valeur EN AMONT, dans la clause `.eq`, fait le tri.
 */
export function toFaitsMiseEnLigne(raw: unknown): FaitMiseEnLigne[] {
  if (!Array.isArray(raw)) return [];
  const faits: FaitMiseEnLigne[] = [];
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
 * Construit le lecteur de tranches de `pipeline_event` attendu par `fetchAllRows`.
 *
 * `order('id', ...)` : la clé primaire donne un ordre total et déterministe,
 * seule garantie que la pagination ne relise ni ne saute une ligne — même
 * raison que `prospectRangeReader` (`data/queries.ts`). Elle ne sert PAS à
 * choisir ce qui est gardé (contrairement au tri sur `occurred_at` de
 * `deploymentRangeReader`) : ici, rien n'est tronqué, voir plus bas.
 */
export function pipelineEventRangeReader(client: Client): RangeReader<unknown> {
  return (from, to) =>
    client
      .from('pipeline_event')
      .select('prospect_id,status,next_action_at,origin,occurred_at')
      .order('id', { ascending: true })
      .range(from, to) as unknown as ReturnType<RangeReader<unknown>>;
}

/** Même raison que `pipelineEventRangeReader` ci-dessus. */
export function interactionRangeReader(client: Client): RangeReader<unknown> {
  return (from, to) =>
    client
      .from('interaction')
      .select('prospect_id,occurred_at')
      .order('id', { ascending: true })
      .range(from, to) as unknown as ReturnType<RangeReader<unknown>>;
}

/**
 * Le lecteur de tranches de `deployment_event`, restreint aux lignes qui
 * valent « site mis en ligne » — l'énoncé de la tâche : `step: 'en_ligne'`
 * **et** `outcome: 'reussi'`. Poser ce filtre ici, dans la clause `.eq`, n'est
 * pas une décision : c'est la définition donnée, traduite en requête plutôt
 * que rejouée en mémoire après coup — et ça réduit d'autant le volume à
 * paginer.
 */
export function sitesMisEnLigneRangeReader(client: Client): RangeReader<unknown> {
  return (from, to) =>
    client
      .from('deployment_event')
      .select('prospect_id,occurred_at')
      .eq('step', 'en_ligne')
      .eq('outcome', 'reussi')
      .order('id', { ascending: true })
      .range(from, to) as unknown as ReturnType<RangeReader<unknown>>;
}

/**
 * Lit une table en la nommant dans l'erreur qu'elle peut lever.
 *
 * `fetchAllRows` échoue déjà avec un message utile (ligne atteinte, cause) —
 * mais ce message ne dit pas DE QUELLE table il vient, puisque `fetchAllRows`
 * est générique. Sans ce nom, un échec sur `interaction` et un échec sur
 * `deployment_event` seraient indiscernables à la lecture du message, alors
 * que la tâche 8 (ou un journal d'erreur) doit pouvoir désigner la source.
 */
async function lireTable(nom: string, lecteur: RangeReader<unknown>, options?: FetchAllOptions): Promise<unknown[]> {
  try {
    return await fetchAllRows(lecteur, options);
  } catch (cause) {
    throw new Error(`${nom} : lecture impossible — ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/**
 * Lit les trois sources brutes du jeu et les rend dans la forme que
 * `domain/jeu.ts` attend (`EntreesJeu`).
 *
 * **La borne, et ce qu'elle garantit.** `pipeline_event` et `interaction`
 * grossissent à chaque geste (tâche 5, et chaque appel/email journalisé) : il
 * ne faut ni les lire sans limite, ni les tronquer en silence. Ces deux
 * exigences s'opposent au premier réglage venu :
 *
 * - Un plafond en NOMBRE DE LIGNES (`.limit(500)`, par exemple) coupe le flux
 *   à un rang qui ne correspond à aucune date précise. `objectifDuJour` et
 *   `serieDeJours` (domain/jeu.ts) raisonnent en jours civils : une journée
 *   chargée peut à elle seule épuiser tout le plafond, et la fenêtre de 14
 *   jours se retrouverait amputée sans qu'aucune erreur ne le signale — la
 *   série s'arrêterait net, en silence, pour une raison qui n'a rien à voir
 *   avec l'activité réelle. C'est exactement le piège que ce fichier doit
 *   éviter.
 * - Un plafond en DATE (« les 90 derniers jours », disons) résout ce
 *   problème-là, mais en ouvre un autre, plus grave : `calculerPalier` et
 *   `calculerBadges` (domain/jeu.ts) comptent les relances tenues et les
 *   rendez-vous obtenus DEPUIS TOUJOURS — un badge acquis ne doit jamais se
 *   reverrouiller. Borner par date ferait sortir de la fenêtre, un jour, une
 *   relance tenue il y a longtemps : le score et les badges régresseraient
 *   silencieusement, ce que la doctrine du jeu (badges liés à des jalons
 *   réels, jamais retirés) interdit explicitement.
 *
 * La borne posée ici est donc celle de `fetchAllRows` : pagination COMPLÈTE
 * (aucune ligne n'est sacrifiée, aucune fenêtre n'est coupée), protégée par
 * `hardLimit` — un volume qui ne termine jamais échoue bruyamment plutôt que
 * de rendre une page partielle pour un historique complet. C'est la même
 * garantie que `prospectRangeReader` offre déjà à la table `prospect`, qui
 * grossit tout autant.
 *
 * **Ce que cette borne NE garantit PAS.** Elle ne plafonne ni le coût ni la
 * latence de la lecture : une table de plusieurs dizaines de milliers de
 * lignes sera lue en entier à chaque chargement de l'écran. Tant que
 * `domain/jeu.ts` recalcule le score cumulé à partir de l'historique brut
 * plutôt que depuis un compteur tenu à jour côté serveur, ce coût est
 * inhérent au contrat qu'il impose à ce pont — une évolution future
 * souhaitable, mais hors du périmètre de cette tâche.
 */
export async function fetchEntreesJeu(
  client: Client,
  now: Date = new Date(),
  options?: FetchAllOptions,
): Promise<EntreesJeu> {
  const [pipelineRaw, interactionRaw, miseEnLigneRaw] = await Promise.all([
    lireTable('pipeline_event', pipelineEventRangeReader(client), options),
    lireTable('interaction', interactionRangeReader(client), options),
    lireTable('deployment_event', sitesMisEnLigneRangeReader(client), options),
  ]);
  return {
    maintenant: now,
    evenementsPipeline: toFaitsPipeline(pipelineRaw),
    interactions: toFaitsInteraction(interactionRaw),
    sitesMisEnLigne: toFaitsMiseEnLigne(miseEnLigneRaw),
  };
}

/**
 * Lit les trois sources ET assemble le jeu — ce que `useJeu` (le hook)
 * consomme directement. Simple composition, comme `fetchDeployments`
 * (`data/deployments.ts`) compose ses lectures et `etatDepuisEvenements` :
 * aucune règle nouvelle, `construireJeu` reste l'unique décideur.
 */
export async function fetchJeu(client: Client, now: Date = new Date(), options?: FetchAllOptions): Promise<Jeu> {
  const entrees = await fetchEntreesJeu(client, now, options);
  return construireJeu(entrees);
}
