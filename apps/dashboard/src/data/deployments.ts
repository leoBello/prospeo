import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';
import {
  dernierEvenementPipeline,
  etatDepuisEvenements,
  joursAvantPeremption,
  type DeploymentEventView,
  type DeploymentSite,
  type DeploymentView,
} from '../domain/deployment.js';
import { fetchAllRows, type FetchAllOptions, type RangeReader } from './paginate.js';

/**
 * Lecteurs Supabase de l'écran de suivi du déploiement.
 *
 * Aucune logique d'état ici : c'est `domain/deployment.ts` qui décide. Ce
 * fichier ne fait que demander les bonnes colonnes et les mettre en forme —
 * même partage des rôles qu'entre `data/queries.ts` et `domain/prospect.ts`.
 */

type Client = SupabaseClient<Database>;

const ETAPES: readonly Enums<'deployment_step'>[] = [
  'redaction',
  'depot',
  'projet',
  'build',
  'en_ligne',
  'retrait',
];

const ISSUES: readonly Enums<'deployment_outcome'>[] = ['demarre', 'reussi', 'echoue', 'ignore'];

/**
 * Un prospect avec ses deux satellites de déploiement dans la même requête.
 *
 * Même raison que pour les quatre satellites de `PROSPECT_SELECT` : une
 * lecture séparée du site et des événements les prendrait à des instants
 * différents, et un événement écrit entre les deux passerait pour absent
 * d'une ligne qui l'a pourtant déjà.
 */
export const DEPLOYMENT_SELECT = [
  'id',
  'denomination',
  'denomination_usuelle',
  'trade_slug',
  'city',
  'prospect_score(total)',
  'prospect_site(deployment_url,published_at,unpublished_at)',
  'deployment_event(step,outcome,detail,duration_ms,occurred_at)',
].join(',');

/** Construit le lecteur de tranches attendu par `fetchAllRows` — voir `prospectRangeReader`. */
export function deploymentRangeReader(client: Client): RangeReader<unknown> {
  return (from, to) =>
    client
      .from('prospect')
      .select(DEPLOYMENT_SELECT)
      .order('id', { ascending: true })
      .range(from, to) as unknown as ReturnType<RangeReader<unknown>>;
}

/** Ramène une relation un-à-un à un objet ou à `null` — PostgREST la rend tantôt en objet, tantôt en tableau d'un élément. */
function unique(value: unknown): Record<string, unknown> | null {
  const cible = Array.isArray(value) ? value[0] : value;
  return typeof cible === 'object' && cible !== null ? (cible as Record<string, unknown>) : null;
}

function texte(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nombre(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function toSite(raw: unknown): DeploymentSite {
  const o = unique(raw);
  return {
    deploymentUrl: o === null ? null : texte(o['deployment_url']),
    publishedAt: o === null ? null : texte(o['published_at']),
    unpublishedAt: o === null ? null : texte(o['unpublished_at']),
  };
}

/**
 * Les événements bruts d'un prospect en vues typées.
 *
 * Une ligne dont l'étape ou l'issue ne fait pas partie des énumérations
 * connues est écartée plutôt que forcée : un jeton que la base ne nomme pas
 * ne peut pas peser sur une dérivation d'état, comme `typeDeTelephone` dans
 * `queries.ts` écarte déjà un `phone_kind` inconnu.
 */
export function toDeploymentEvents(raw: unknown): DeploymentEventView[] {
  if (!Array.isArray(raw)) return [];
  const evenements: DeploymentEventView[] = [];
  for (const brut of raw) {
    const o = unique(brut);
    if (o === null) continue;
    const step = o['step'];
    const outcome = o['outcome'];
    const occurredAt = texte(o['occurred_at']);
    if (!ETAPES.includes(step as Enums<'deployment_step'>)) continue;
    if (!ISSUES.includes(outcome as Enums<'deployment_outcome'>)) continue;
    if (occurredAt === null) continue;
    evenements.push({
      step: step as Enums<'deployment_step'>,
      outcome: outcome as Enums<'deployment_outcome'>,
      detail: texte(o['detail']),
      durationMs: nombre(o['duration_ms']),
      occurredAt,
    });
  }
  return evenements;
}

/**
 * Traduit une ligne PostgREST en `DeploymentView`.
 *
 * `gabarit` et `maintenant` sont fournis par l'appelant : le premier est le
 * même pour toutes les lignes (le gabarit actif est une donnée globale, pas
 * un satellite du prospect), le second parce que cette fonction reste pure
 * une fois les données en main — c'est `fetchDeployments` qui lit l'horloge,
 * une seule fois pour tout l'écran.
 */
export function toDeploymentView(raw: unknown, gabarit: string | null, maintenant: Date): DeploymentView {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const site = toSite(o['prospect_site']);
  const events = toDeploymentEvents(o['deployment_event']);
  const scoreObj = unique(o['prospect_score']);
  const courant = dernierEvenementPipeline(events);

  return {
    prospectId: texte(o['id']) ?? '',
    nom: texte(o['denomination_usuelle']) ?? texte(o['denomination']) ?? '',
    tradeSlug: texte(o['trade_slug']) ?? '',
    city: texte(o['city']) ?? '',
    score: scoreObj === null ? null : nombre(scoreObj['total']),
    gabarit,
    etat: etatDepuisEvenements(events, site),
    etapeCourante: courant?.step ?? null,
    detail: courant?.detail ?? null,
    durationMs: courant?.durationMs ?? null,
    deploymentUrl: site.deploymentUrl,
    publishedAt: site.publishedAt,
    unpublishedAt: site.unpublishedAt,
    peremptionDans: joursAvantPeremption(site.publishedAt, maintenant),
  };
}

/**
 * Le gabarit actif désigné en base (`site_template`, ligne singleton `id=1`).
 *
 * `maybeSingle` et non `single` : une ligne absente est un problème
 * d'infrastructure (migration non jouée) que cette fonction laisse remonter
 * comme `null` plutôt que de le confondre avec une erreur réseau — à charge
 * de l'écran de décider s'il l'affiche ou le signale.
 */
export async function fetchSiteTemplate(client: Client): Promise<string | null> {
  const { data, error } = await client
    .from('site_template')
    .select('repo_full_name')
    .eq('id', 1)
    .maybeSingle();
  if (error !== null) {
    throw new Error(`site_template : lecture impossible — ${error.message}`);
  }
  const valeur = data?.repo_full_name?.trim();
  return valeur === undefined || valeur === '' ? null : valeur;
}

/**
 * Les événements d'UN prospect, du plus ancien au plus récent.
 *
 * Séparée de `fetchDeployments` : un panneau de détail qui veut rafraîchir
 * l'historique d'une seule ligne n'a pas à recharger tout l'écran pour ça.
 */
export async function fetchEventsFor(
  client: Client,
  prospectId: string,
): Promise<DeploymentEventView[]> {
  const { data, error } = await client
    .from('deployment_event')
    .select('step,outcome,detail,duration_ms,occurred_at')
    .eq('prospect_id', prospectId)
    .order('occurred_at', { ascending: true });
  if (error !== null) {
    throw new Error(`deployment_event : lecture impossible pour ${prospectId} — ${error.message}`);
  }
  return toDeploymentEvents(data ?? []);
}

/**
 * Lit toutes les lignes de l'écran de suivi du déploiement.
 *
 * Une seule lecture paginée pour le prospect, son site et ses événements,
 * plus une lecture du gabarit actif — deux allers-retours en tout, pas un
 * par ligne. `now` est un paramètre et non `new Date()` figé dans le corps :
 * un appelant de test fixe l'horloge, l'écran réel laisse le défaut.
 */
export async function fetchDeployments(
  client: Client,
  now: Date = new Date(),
  options?: FetchAllOptions,
): Promise<DeploymentView[]> {
  const [lignes, gabarit] = await Promise.all([
    fetchAllRows(deploymentRangeReader(client), options),
    fetchSiteTemplate(client),
  ]);
  return lignes.map((ligne) => toDeploymentView(ligne, gabarit, now));
}
