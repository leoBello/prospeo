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
  social_urls: string[];
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
    social_urls: [],
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
  failed: number;
  blocked: boolean;
  stoppedByCap: boolean;
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

export async function runEnrich(options: RunEnrichOptions): Promise<EnrichReport> {
  const report: EnrichReport = {
    processed: 0,
    ok: 0,
    ambiguous: 0,
    notFound: 0,
    failed: 0,
    blocked: false,
    stoppedByCap: false,
  };

  for (const prospect of options.prospects) {
    if (report.processed >= options.dailyRemaining) {
      report.stoppedByCap = true;
      break;
    }

    try {
      let candidates: MapsCandidate[] = [];
      for (const query of queriesFor(prospect, options.trade)) {
        candidates = await options.source.search(query);
        if (candidates.length > 0) break;
      }

      const row = buildEnrichmentRow(prospect, candidates, options.trade, options.config);
      await options.upsert(row);

      report.processed += 1;
      if (row.status === 'ok') report.ok += 1;
      else if (row.status === 'ambiguous') report.ambiguous += 1;
      else report.notFound += 1;
    } catch (error) {
      if (error instanceof BlockedError) {
        // Le run s'arrête net. Continuer martèlerait une protection qui vient
        // de se déclencher, ce qui la durcit et remplit la base de fiches
        // vides indiscernables de vraies absences.
        await options.upsert(emptyRow(prospect.id, 'blocked'));
        report.blocked = true;
        break;
      }
      report.failed += 1;
      process.stderr.write(
        `enrich: échec sur ${prospect.id} — ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
  }

  return report;
}
