import {
  normalizePhone,
  selectMatch,
  type MapsCandidate,
  type MatchingConfig,
  type MatchSubject,
  type ScoredCandidate,
  type Trade,
} from '@prospeo/core';
import { BlockedError, type MapsSource } from '../sources/google-maps.js';

/**
 * Une ligne de justification, recopiée en alias de type plutôt que reprise de
 * `MatchLine`.
 *
 * TypeScript n'accorde d'index signature implicite qu'aux alias de type, pas
 * aux interfaces : `MatchLine` étant une interface, un tableau de `MatchLine`
 * ne serait pas assignable au type `Json` de la colonne `jsonb` qui le
 * stocke. Même contrainte, et même remède, que `ScoreLine` dans
 * `packages/core`.
 */
type ReviewLine = { code: string; label: string; points: number };

/** Ce qu'on garde d'un candidat écarté, pour que la revue puisse trancher. */
export type ReviewCandidate = {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string;
  confidence: number;
  lines: ReviewLine[];
};

export interface EnrichProspect {
  id: string;
  denomination: string;
  denominationUsuelle: string | null;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

/** Ce que l'étage écrit dans `prospect_enrichment`. */
export interface EnrichmentRow {
  prospect_id: string;
  source: string;
  matched_name: string | null;
  match_confidence: number | null;
  phone_e164: string | null;
  phone_kind: string | null;
  declared_url: string | null;
  // Pas de `social_urls` ici, volontairement : `enrich` ne peuple jamais cette
  // colonne, et la réécrire à `[]` à chaque upsert écraserait sur conflit une
  // donnée que cet étage ne connaît pas. L'omettre préserve la valeur
  // existante ; l'insertion reste valide, la colonne étant déclarée
  // `jsonb not null default '[]'::jsonb` dans la migration initiale.
  rating: number | null;
  review_count: number | null;
  place_id: string | null;
  maps_url: string | null;
  /** Candidats conservés pour la revue manuelle ; vide hors `ambiguous`. */
  candidates: ReviewCandidate[];
  status: 'ok' | 'not_found' | 'ambiguous' | 'blocked';
  enriched_at: string;
}

const SOURCE = 'google_maps';

function emptyRow(prospectId: string, status: EnrichmentRow['status']): EnrichmentRow {
  return {
    prospect_id: prospectId,
    source: SOURCE,
    matched_name: null,
    match_confidence: null,
    phone_e164: null,
    phone_kind: null,
    declared_url: null,
    rating: null,
    review_count: null,
    place_id: null,
    maps_url: null,
    candidates: [],
    status,
    enriched_at: new Date().toISOString(),
  };
}

function forReview(scored: ScoredCandidate): ReviewCandidate {
  return {
    name: scored.candidate.name,
    address: scored.candidate.address,
    phone: scored.candidate.phone,
    website: scored.candidate.website,
    mapsUrl: scored.candidate.mapsUrl,
    confidence: scored.score.confidence,
    lines: scored.score.lines,
  };
}

export function buildEnrichmentRow(
  prospect: EnrichProspect,
  candidates: readonly MapsCandidate[],
  trade: Trade,
  config: MatchingConfig,
): EnrichmentRow {
  const subject: MatchSubject = {
    denomination: prospect.denomination,
    denominationUsuelle: prospect.denominationUsuelle,
    latitude: prospect.latitude,
    longitude: prospect.longitude,
  };
  const outcome = selectMatch(subject, candidates, trade, config);

  if (outcome.kind === 'not_found') return emptyRow(prospect.id, 'not_found');

  if (outcome.kind === 'ambiguous') {
    // Aucune donnée de fiche n'est écrite. Un téléphone non validé serait
    // indiscernable d'un téléphone confirmé, et finirait composé.
    const row = emptyRow(prospect.id, 'ambiguous');
    row.candidates = outcome.scored.map(forReview);
    return row;
  }

  const phone = normalizePhone(outcome.candidate.phone);
  const row = emptyRow(prospect.id, 'ok');
  row.matched_name = outcome.candidate.name;
  row.match_confidence = outcome.score.confidence;
  row.phone_e164 = phone?.e164 ?? null;
  row.phone_kind = phone?.kind ?? null;
  row.declared_url = outcome.candidate.website;
  row.rating = outcome.candidate.rating;
  row.review_count = outcome.candidate.reviewCount;
  row.place_id = outcome.candidate.placeId;
  row.maps_url = outcome.candidate.mapsUrl;
  return row;
}

export interface EnrichReport {
  processed: number;
  ok: number;
  ambiguous: number;
  notFound: number;
  /**
   * Échecs de **lecture** (Google). Isolés par nature : le prospect suivant
   * peut très bien réussir, donc le run continue.
   */
  failed: number;
  /**
   * Échecs d'**écriture** (Supabase). Comptés à part parce qu'ils ne sont pas
   * de la même famille : la ligne écrite est le seul point de reprise du run,
   * sans elle le prospect sera rescrapé au run suivant. Un run qui n'écrit
   * rien a brûlé du quota Google pour rien.
   */
  writeFailed: number;
  blocked: boolean;
  stoppedByCap: boolean;
  /** Run interrompu par une série d'échecs d'écriture : ce n'est plus un incident. */
  stoppedByWriteFailures: boolean;
}

export interface RunEnrichOptions {
  prospects: readonly EnrichProspect[];
  trade: Trade;
  config: MatchingConfig;
  /**
   * Volontairement réduit à `search` : l'étage ne ferme pas la source et ne
   * lit pas son compteur de navigations, c'est l'appelant qui les possède —
   * lui seul sait quand le run est fini. Exiger le `MapsSource` complet ne
   * ferait qu'obliger les appelants, tests compris, à fournir des membres que
   * cette fonction n'appelle jamais. Une source complète satisfait ce type.
   */
  source: Pick<MapsSource, 'search'>;
  upsert: (row: EnrichmentRow) => Promise<void>;
  /** Nombre de fiches encore autorisées aujourd'hui. */
  dailyRemaining: number;
}

/** Requêtes tentées dans l'ordre ; l'enseigne d'abord, c'est elle que Maps connaît. */
function queriesFor(prospect: EnrichProspect, trade: Trade): string[] {
  const queries: string[] = [];
  if (prospect.denominationUsuelle !== null) {
    queries.push(`"${prospect.denominationUsuelle}" ${prospect.city}`);
  }
  queries.push(`"${prospect.denomination}" ${prospect.city}`);
  const fallback = trade.mapsQueries[0] ?? trade.slug;
  queries.push(`${fallback} ${prospect.address}`);
  return queries;
}

/**
 * Nombre d'échecs d'écriture consécutifs au-delà duquel le run s'interrompt.
 *
 * Un échec isolé arrive ; trois d'affilée ne sont plus un incident mais une
 * panne — migration non poussée sur l'environnement, clé sans droit
 * d'écriture. Continuer ne ferait que scraper Google pour jeter le résultat.
 */
const MAX_CONSECUTIVE_WRITE_FAILURES = 3;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Joue les requêtes dans l'ordre et rend la ligne à écrire.
 *
 * L'arrêt se fait à la première requête dont le statut n'est **pas**
 * `not_found`, et non à la première qui rend des candidats : la règle du
 * projet est « arrêt à la première requête qui produit un candidat *retenu* ».
 * La nuance décide du résultat. Une dénomination usuelle générique — « AZUR »
 * — rend volontiers cinq fiches sans rapport que `selectMatch` écarte toutes ;
 * s'arrêter là condamnerait le prospect à `not_found` sans jamais essayer la
 * raison sociale exacte, celle qui aurait trouvé la bonne fiche. Et le verdict
 * serait définitif, `not_found` n'étant pas rejoué sans `--retry-not-found`.
 */
async function searchAndBuild(
  prospect: EnrichProspect,
  options: RunEnrichOptions,
): Promise<EnrichmentRow> {
  let row: EnrichmentRow | null = null;
  for (const query of queriesFor(prospect, options.trade)) {
    const candidates: MapsCandidate[] = await options.source.search(query);
    // Une requête sans aucun candidat n'a rien à apparier : inutile de la
    // scorer, la requête suivante a toutes ses chances.
    if (candidates.length === 0) continue;
    row = buildEnrichmentRow(prospect, candidates, options.trade, options.config);
    if (row.status !== 'not_found') return row;
  }
  // Toutes les requêtes ont rendu `not_found` : on garde la dernière ligne
  // construite, ou une ligne vide si aucune n'a rendu le moindre candidat.
  return row ?? emptyRow(prospect.id, 'not_found');
}

export async function runEnrich(options: RunEnrichOptions): Promise<EnrichReport> {
  const report: EnrichReport = {
    processed: 0,
    ok: 0,
    ambiguous: 0,
    notFound: 0,
    failed: 0,
    writeFailed: 0,
    blocked: false,
    stoppedByCap: false,
    stoppedByWriteFailures: false,
  };

  let consecutiveWriteFailures = 0;

  for (const prospect of options.prospects) {
    if (report.processed >= options.dailyRemaining) {
      report.stoppedByCap = true;
      break;
    }

    // Lecture et écriture sont dans deux `try` distincts, parce que les deux
    // échecs ne se traitent pas pareil : un échec de lecture est isolé, un
    // échec d'écriture rompt l'invariant du run.
    let row: EnrichmentRow;
    try {
      row = await searchAndBuild(prospect, options);
    } catch (error) {
      if (error instanceof BlockedError) {
        // Le run s'arrête net. Continuer martèlerait une protection qui vient
        // de se déclencher, ce qui la durcit et remplit la base de fiches
        // vides indiscernables de vraies absences.
        //
        // Le drapeau est posé AVANT l'écriture : le blocage est un fait
        // constaté, il ne doit pas dépendre de la réussite de sa persistance.
        // Laisser l'exception d'écriture remonter ferait sortir le CLI en 1 au
        // lieu de 2, sans message d'arrêt — indiscernable d'une erreur
        // d'usage, et une automatisation qui relance sur 1 repartirait droit
        // dans la protection anti-bot.
        report.blocked = true;
        try {
          await options.upsert(emptyRow(prospect.id, 'blocked'));
        } catch (writeError) {
          report.writeFailed += 1;
          process.stderr.write(
            `enrich: échec d'écriture de la ligne blocked sur ${prospect.id} — ${messageOf(writeError)}\n`,
          );
        }
        break;
      }
      report.failed += 1;
      process.stderr.write(
        `enrich: échec de lecture sur ${prospect.id} — ${messageOf(error)}\n`,
      );
      continue;
    }

    try {
      await options.upsert(row);
    } catch (error) {
      report.writeFailed += 1;
      consecutiveWriteFailures += 1;
      process.stderr.write(
        `enrich: échec d'écriture sur ${prospect.id} — ${messageOf(error)}\n`,
      );
      if (consecutiveWriteFailures >= MAX_CONSECUTIVE_WRITE_FAILURES) {
        report.stoppedByWriteFailures = true;
        break;
      }
      continue;
    }
    consecutiveWriteFailures = 0;

    report.processed += 1;
    if (row.status === 'ok') report.ok += 1;
    else if (row.status === 'ambiguous') report.ambiguous += 1;
    else report.notFound += 1;
  }

  return report;
}
