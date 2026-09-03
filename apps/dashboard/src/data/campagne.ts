import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums } from '@prospeo/db';
import type { FaitsLigne, FaitsProspect } from '../domain/campagne.js';
import { fetchAllRows, type RangeReader } from './paginate.js';

/**
 * Lectures Supabase de l'écran de campagne.
 *
 * Aucune logique d'état ici : c'est `domain/campagne.ts` qui décide. Ce
 * fichier ne fait que demander les bonnes colonnes et les mettre en forme —
 * même partage des rôles qu'entre `data/deployments.ts` et
 * `domain/deployment.ts`.
 */

type Client = SupabaseClient<Database>;

/**
 * Les satellites dans la MÊME requête, et non en lectures séparées.
 *
 * Même raison que `DEPLOYMENT_SELECT` : des lectures séparées les
 * prendraient à des instants différents, et une interaction écrite entre les
 * deux passerait pour absente d'une ligne qui l'a pourtant déjà — ce qui
 * ferait entrer dans le lot un prospect déjà contacté.
 *
 * `interaction` et `generated_message` sont plafonnées à 1 lors de la
 * lecture (voir `campagneRangeReader`) : on ne veut savoir que s'il en
 * existe, pas les lire.
 */
export const CAMPAGNE_SELECT = [
  'id',
  'denomination',
  'city',
  'trade_slug',
  'prospect_score(total)',
  'web_presence(category)',
  'prospect_pipeline(status)',
  'prospect_site(published_at,deployment_url)',
  'prospect_contact(email)',
  'interaction(id)',
  'generated_message(id)',
].join(',');

/** Ramène une relation un-à-un à un objet ou à `null` — PostgREST la rend tantôt en objet, tantôt en tableau d'un élément. Reprise à l'identique de `data/deployments.ts`. */
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

function nonVide(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export function toFaitsProspect(raw: unknown): FaitsProspect | null {
  const o = unique(raw);
  if (o === null) return null;

  const id = texte(o['id']);
  // Une ligne sans identifiant ne peut ni être classée ni être cliquée :
  // l'écarter vaut mieux que de lui en fabriquer un.
  if (id === null) return null;

  const site = unique(o['prospect_site']);
  const pipeline = unique(o['prospect_pipeline']);

  return {
    prospectId: id,
    denomination: texte(o['denomination']) ?? '',
    ville: texte(o['city']) ?? '',
    tradeSlug: texte(o['trade_slug']) ?? '',
    // `null` traversé tel quel : un prospect jamais scoré n'est pas un
    // prospect à zéro (D3, doctrine du dépôt).
    score: nombre(unique(o['prospect_score'])?.['total']),
    presence: (texte(unique(o['web_presence'])?.['category']) ??
      null) as Enums<'web_presence_category'> | null,
    // `a_contacter` est le défaut de la colonne en base : une ligne
    // `prospect_pipeline` absente signifie « pas encore suivi », ce qui EST
    // « à contacter ».
    statut: (texte(pipeline?.['status']) ?? 'a_contacter') as Enums<'pipeline_status'>,
    aInteraction: nonVide(o['interaction']),
    aMessage: nonVide(o['generated_message']),
    // Un dépôt créé n'est pas un site publié : seule `published_at` le dit.
    sitePublie: site !== null && texte(site['published_at']) !== null,
  };
}

/** Construit le lecteur de tranches attendu par `fetchAllRows` — voir `deploymentRangeReader`. */
export function campagneRangeReader(client: Client): RangeReader<unknown> {
  return (from, to) =>
    client
      .from('prospect')
      .select(CAMPAGNE_SELECT)
      .order('id', { ascending: true })
      .limit(1, { referencedTable: 'interaction' })
      .limit(1, { referencedTable: 'generated_message' })
      .range(from, to) as unknown as ReturnType<RangeReader<unknown>>;
}

export async function fetchHeartbeat(
  client: Client,
): Promise<{ beatAt: string; inFlight: number } | null> {
  const { data, error } = await client
    .from('worker_heartbeat')
    .select('beat_at,in_flight')
    .eq('id', true)
    .maybeSingle();
  if (error !== null) throw new Error(error.message);
  if (data === null) return null;
  return { beatAt: data.beat_at, inFlight: data.in_flight };
}

type JobActif = { state: Enums<'campaign_job_state'>; lastError: string | null; rang: number };

/**
 * Les jobs qui pèsent sur l'écran, et le RANG de chacun dans la file.
 *
 * Le rang ne se lit nulle part : il se calcule à la lecture, sur l'ordre de
 * `requested_at`. Le stocker en base obligerait à réécrire toutes les lignes
 * à chaque prise — et il serait faux entre deux écritures.
 *
 * Seuls les jobs ACTIFS et le dernier échec comptent : un job terminé est
 * déjà visible par ses effets (site en ligne, message écrit), et l'afficher
 * ferait dire à la ligne deux choses à la fois.
 */
async function fetchJobs(client: Client): Promise<Map<string, JobActif>> {
  const { data, error } = await client
    .from('campaign_job')
    .select('prospect_id,state,last_error,requested_at')
    .in('state', ['en_attente', 'en_cours', 'echoue'])
    .order('requested_at', { ascending: true });
  if (error !== null) throw new Error(error.message);

  const jobs = new Map<string, JobActif>();
  let rang = 0;
  for (const r of data ?? []) {
    // Le rang ne se compte QUE sur l'attente : un job en cours n'attend pas,
    // et un job échoué encore moins. Les inclure gonflerait le rang annoncé
    // et ferait mentir « 3e » sur le temps restant.
    if (r.state === 'en_attente') rang += 1;
    jobs.set(r.prospect_id, {
      state: r.state,
      lastError: r.last_error,
      rang: r.state === 'en_attente' ? rang : 0,
    });
  }
  return jobs;
}

/** Le dernier événement de déploiement de chaque prospect. */
async function fetchDernieresEtapes(
  client: Client,
): Promise<
  Map<string, { step: Enums<'deployment_step'>; outcome: Enums<'deployment_outcome'>; detail: string | null }>
> {
  // Plafonné comme dans `data/deployments.ts` : le journal grossit à chaque
  // passage du worker, et l'écran n'a besoin que du dernier par prospect.
  const { data, error } = await client
    .from('deployment_event')
    .select('prospect_id,step,outcome,detail,occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(500);
  if (error !== null) throw new Error(error.message);

  const etapes = new Map<
    string,
    { step: Enums<'deployment_step'>; outcome: Enums<'deployment_outcome'>; detail: string | null }
  >();
  for (const r of data ?? []) {
    // Tri décroissant : la PREMIÈRE ligne vue pour un prospect est la plus
    // récente. Les suivantes ne l'écrasent pas.
    if (etapes.has(r.prospect_id)) continue;
    etapes.set(r.prospect_id, { step: r.step, outcome: r.outcome, detail: r.detail });
  }
  return etapes;
}

/** Le dernier envoi de chaque prospect, tous états confondus. */
async function fetchEnvois(
  client: Client,
): Promise<Map<string, { state: Enums<'send_state'>; sentAt: string | null }>> {
  const { data, error } = await client
    .from('message_send')
    .select('prospect_id,state,sent_at,started_at')
    .order('started_at', { ascending: false });
  if (error !== null) throw new Error(error.message);

  const envois = new Map<string, { state: Enums<'send_state'>; sentAt: string | null }>();
  for (const r of data ?? []) {
    if (envois.has(r.prospect_id)) continue;
    envois.set(r.prospect_id, { state: r.state, sentAt: r.sent_at });
  }
  return envois;
}

export interface LectureCampagne {
  faits: FaitsProspect[];
  lignes: Map<string, FaitsLigne>;
  /**
   * Combien de prospects sont qualifiés dans la base, tous statuts confondus.
   *
   * C'est ce qui permet à l'écran de distinguer « le lot est fini » de « la
   * base est vide » — deux absences de natures différentes, que le seul
   * `faits.length === 0` confondrait.
   */
  totalQualifies: number;
}

export async function fetchCampagne(client: Client): Promise<LectureCampagne> {
  // Les quatre lectures en parallèle : elles sont indépendantes, et les
  // enchaîner tripleraient l'attente au premier affichage.
  const [brut, jobs, etapes, envois] = await Promise.all([
    fetchAllRows<unknown>(campagneRangeReader(client), {}),
    fetchJobs(client),
    fetchDernieresEtapes(client),
    fetchEnvois(client),
  ]);

  const faits: FaitsProspect[] = [];
  const lignes = new Map<string, FaitsLigne>();

  for (const row of brut) {
    const f = toFaitsProspect(row);
    if (f === null) continue;
    faits.push(f);

    // Les satellites du même row : c'est la lecture unique de `brut`, pas une
    // requête séparée, qui garantit qu'ils datent du même instant que `f`.
    const o = unique(row);
    const site = unique(o?.['prospect_site']);
    lignes.set(f.prospectId, {
      job: jobs.get(f.prospectId) ?? null,
      derniereEtape: etapes.get(f.prospectId) ?? null,
      // « En ligne » veut dire joignable, pas « dépôt créé » : c'est l'URL
      // qui le prouve, et elle n'est écrite qu'une fois le build terminé.
      siteEnLigne: site !== null && texte(site['deployment_url']) !== null,
      mailRedige: nonVide(o?.['generated_message']),
      adresse: texte(unique(o?.['prospect_contact'])?.['email']),
      envoi: envois.get(f.prospectId) ?? null,
    });
  }

  return { faits, lignes, totalQualifies: faits.length };
}
