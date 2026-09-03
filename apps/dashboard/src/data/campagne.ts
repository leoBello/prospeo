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
 *
 * `deployment_event` et `message_send` sont embarquées ICI, et non lues à
 * part comme elles l'étaient : une lecture séparée de `deployment_event`
 * plafonnait GLOBALEMENT à 500 lignes toutes prospects confondus — dès que
 * le journal dépassait ce volume, un prospect plus ancien perdait sa
 * dernière étape et rendait `null`, indiscernable d'un prospect jamais
 * déployé (une absence fabriquée par une troncature, exactement ce que la
 * doctrine des absences interdit). `message_send`, elle, était lue sans
 * `.limit()` du tout et donc soumise au plafond implicite de PostgREST
 * (1000 lignes, voir `paginate.ts`) sans qu'aucune erreur ne le signale.
 * Embarquées avec un plafond PAR PROSPECT (voir `MAX_ETAPES_PAR_PROSPECT` et
 * `MAX_ENVOIS_PAR_PROSPECT` sur `campagneRangeReader`), les deux échappent à
 * ce mode de panne quel que soit le volume du journal ou de la file d'envoi.
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
  'deployment_event(step,outcome,detail,occurred_at)',
  'message_send(state,sent_at,started_at)',
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

/**
 * Plafonds des relations embarquées, PAR PROSPECT et non globaux.
 *
 * Un plafond global sur `deployment_event` (comme l'ancienne lecture séparée
 * de `fetchDernieresEtapes`, à 500 lignes toutes prospects confondus) se
 * fait manger par le journal : le worker écrit plusieurs événements par
 * prospect et par passage, et dès que le journal dépasse le plafond, ce sont
 * les prospects les PLUS ANCIENS qui perdent leur dernière étape en premier
 * — un prospect entièrement déployé la semaine dernière redeviendrait
 * indiscernable d'un prospect jamais touché. Un plafond PAR PROSPECT, lui,
 * est immunisé contre le volume total du journal : chaque prospect garde sa
 * part, quel que soit le nombre de prospects ou de passages du worker.
 *
 * Cinq et non un seul : cet écran n'affiche que la DERNIÈRE étape ou le
 * DERNIER envoi de chaque prospect (contrairement à `DEPLOYMENT_SELECT`, qui
 * garde 30 événements pour rejouer tout l'historique visible à l'écran de
 * suivi) — un plafond bien plus bas suffit donc, avec une petite marge pour
 * qu'un aléa d'écriture (deux lignes au même horodatage) ne fasse pas
 * disparaître la plus récente derrière une autre déjà gardée.
 */
const MAX_ETAPES_PAR_PROSPECT = 5;
const MAX_ENVOIS_PAR_PROSPECT = 5;

/** Construit le lecteur de tranches attendu par `fetchAllRows` — voir `deploymentRangeReader`. */
export function campagneRangeReader(client: Client): RangeReader<unknown> {
  return (from, to) =>
    client
      .from('prospect')
      .select(CAMPAGNE_SELECT)
      .order('id', { ascending: true })
      .limit(1, { referencedTable: 'interaction' })
      .limit(1, { referencedTable: 'generated_message' })
      // Modificateurs EMBARQUÉS (PostgREST), sur le modèle exact de
      // `deploymentRangeReader` : décroissant + plafond PAR PROSPECT, pour
      // que ce soient les événements/envois les PLUS RÉCENTS qui soient
      // gardés. `toFaitsLigne` ne suppose pas cet ordre pour autant — elle
      // compare les horodatages elle-même (même précaution que
      // `dernierEvenementPipeline`, domain/deployment.ts) — ce tri ne sert
      // donc qu'à choisir CE QUI est gardé, pas à épargner un second tri.
      .order('occurred_at', { referencedTable: 'deployment_event', ascending: false })
      .limit(MAX_ETAPES_PAR_PROSPECT, { referencedTable: 'deployment_event' })
      .order('started_at', { referencedTable: 'message_send', ascending: false })
      .limit(MAX_ENVOIS_PAR_PROSPECT, { referencedTable: 'message_send' })
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

interface JobRow {
  prospect_id: string;
  state: Enums<'campaign_job_state'>;
  last_error: string | null;
  requested_at: string;
}

/**
 * Construit le lecteur de tranches de `campaign_job` pour `fetchAllRows`.
 *
 * Séparée de `campagneRangeReader` : voir le commentaire de `fetchJobs` sur
 * pourquoi cette lecture ne peut pas être embarquée dans `CAMPAGNE_SELECT`.
 * `requested_at` seul ne garantit pas un ordre total (deux jobs peuvent
 * partager le même horodatage) : `id`, clé primaire, le complète — même
 * contrat que documenté sur `RangeReader` dans `paginate.ts`.
 */
function campaignJobRangeReader(client: Client): RangeReader<JobRow> {
  return (from, to) =>
    client
      .from('campaign_job')
      .select('prospect_id,state,last_error,requested_at')
      // `termine` en fait partie, et ce n'est pas un detail : un job termine a
    // ecrit un message et publie un site, donc D3 exclut desormais son
    // prospect. C'est cette ligne qui permet a l'ecran de continuer a le
    // MONTRER — sans elle, la ligne sur laquelle on vient de cliquer
    // disparait au moment ou elle reussit.
    // `annule` reste dehors : retirer une demande rend la ligne a son etat
    // d'avant.
    .in('state', ['en_attente', 'en_cours', 'echoue', 'termine'])
      .order('requested_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to) as unknown as ReturnType<RangeReader<JobRow>>;
}

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
 *
 * LECTURE SÉPARÉE, ET NON EMBARQUÉE dans `CAMPAGNE_SELECT`, contrairement à
 * `deployment_event` et `message_send` : le rang se calcule sur un ordre
 * GLOBAL de `requested_at`, tous prospects confondus — « 3e dans la file »
 * porte sur la file entière, pas sur les jobs d'un seul prospect. Un
 * modificateur embarqué (`.limit(N, { referencedTable: … })`) ne peut porter
 * que sur la relation d'UN prospect à la fois ; il ne peut pas produire un
 * rang qui dépend de tous les autres. `fetchAllRows`, et non un `.limit()`
 * synthétique, la borne honnêtement : un plafond ici tronquerait la file
 * elle-même, ce qui décalerait le rang de TOUS les jobs qui suivent la
 * coupure, pas seulement de celui qu'on perdrait.
 */
async function fetchJobs(client: Client): Promise<Map<string, JobActif>> {
  const data = await fetchAllRows(campaignJobRangeReader(client), {});

  const jobs = new Map<string, JobActif>();
  let rang = 0;
  for (const r of data) {
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

/**
 * Le plus récent d'une relation embarquée à plusieurs lignes, comparé par
 * horodatage — jamais par ordre reçu.
 *
 * Même précaution que `dernierEvenementPipeline` (domain/deployment.ts) :
 * le tri décroissant de `campagneRangeReader` sert à choisir CE QUI est
 * gardé côté serveur, pas à épargner un second tri ici. Un horodatage
 * illisible ne peut être « le plus récent » de rien : il est écarté plutôt
 * que forcé, même doctrine que `toDeploymentEvents`.
 */
function dernier(rows: unknown, champHorodatage: string): Record<string, unknown> | null {
  if (!Array.isArray(rows)) return null;
  let meilleur: Record<string, unknown> | null = null;
  let meilleurT = Number.NEGATIVE_INFINITY;
  for (const brut of rows) {
    if (typeof brut !== 'object' || brut === null) continue;
    const o = brut as Record<string, unknown>;
    const quand = texte(o[champHorodatage]);
    if (quand === null) continue;
    const t = new Date(quand).getTime();
    if (Number.isNaN(t)) continue;
    if (meilleur === null || t >= meilleurT) {
      meilleur = o;
      meilleurT = t;
    }
  }
  return meilleur;
}

/**
 * Compose une `FaitsLigne` depuis une ligne brute de `CAMPAGNE_SELECT` et le
 * job actif du prospect (lu séparément — voir `fetchJobs`).
 *
 * Fonction PURE, testable sans réseau — même mouvement que `toFaitsProspect`
 * : c'est ce qui permet de prouver, sans base, qu'un prospect sans aucun
 * `deployment_event` embarqué rend une absence réelle (`derniereEtape:
 * null`) et non une troncature, et que l'événement le plus récent l'emporte
 * quand plusieurs sont embarqués.
 */
export function toFaitsLigne(raw: unknown, job: JobActif | null): FaitsLigne {
  const o = unique(raw);
  const site = unique(o?.['prospect_site']);
  const etape = dernier(o?.['deployment_event'], 'occurred_at');
  const envoi = dernier(o?.['message_send'], 'started_at');

  return {
    job,
    derniereEtape:
      etape === null
        ? null
        : {
            step: etape['step'] as Enums<'deployment_step'>,
            outcome: etape['outcome'] as Enums<'deployment_outcome'>,
            detail: texte(etape['detail']),
          },
    // « En ligne » veut dire joignable, pas « dépôt créé » : c'est l'URL qui
    // le prouve, et elle n'est écrite qu'une fois le build terminé.
    siteEnLigne: site !== null && texte(site['deployment_url']) !== null,
    mailRedige: nonVide(o?.['generated_message']),
    adresse: texte(unique(o?.['prospect_contact'])?.['email']),
    envoi:
      envoi === null
        ? null
        : { state: envoi['state'] as Enums<'send_state'>, sentAt: texte(envoi['sent_at']) },
  };
}

export interface LectureCampagne {
  faits: FaitsProspect[];
  lignes: Map<string, FaitsLigne>;
  /**
   * Combien de prospects ont été LUS en tout, sans aucun filtre.
   *
   * Ce chiffre ne mesure ni l'éligibilité ni le score : `faits` contient déjà
   * tous les prospects lus, filtre ou pas, donc `totalProspects` en est
   * littéralement la longueur — pas un compte indépendant. Ce n'est donc PAS
   * lui seul qui distingue « le lot est fini » de « la base ne contient
   * personne » : combiné à `classerLot` (qui, lui, filtre et note), l'écran
   * peut dire que le lot est vide alors que `totalProspects > 0` — deux
   * absences de natures différentes que le seul `faits.length === 0`
   * confondrait, mais que ce champ seul ne suffit pas à distinguer.
   */
  totalProspects: number;
}

export async function fetchCampagne(client: Client): Promise<LectureCampagne> {
  // Les deux lectures en parallèle : elles sont indépendantes, et les
  // enchaîner doublerait l'attente au premier affichage. `deployment_event`
  // et `message_send` ne sont plus des lectures séparées : elles sont
  // embarquées dans `brut` par `CAMPAGNE_SELECT` (voir son commentaire).
  const [brut, jobs] = await Promise.all([
    fetchAllRows<unknown>(campagneRangeReader(client), {}),
    fetchJobs(client),
  ]);

  const faits: FaitsProspect[] = [];
  const lignes = new Map<string, FaitsLigne>();

  for (const row of brut) {
    const f = toFaitsProspect(row);
    if (f === null) continue;
    faits.push(f);

    // Le job est la seule pièce encore lue à part (voir son commentaire) ;
    // tout le reste vient de `row`, donc du même instant que `f`.
    lignes.set(f.prospectId, toFaitsLigne(row, jobs.get(f.prospectId) ?? null));
  }

  return { faits, lignes, totalProspects: faits.length };
}
