import {
  selectMatch,
  type MapsCandidate,
  type MatchingConfig,
  type MatchSubject,
  type ScoredCandidate,
  type Trade,
} from '@prospeo/core';
import type { EnrichmentRow, ReviewCandidate } from './enrich.js';

/**
 * Rejeu hors ligne de l'appariement, sur les candidats déjà en base.
 *
 * Le jalon de calibration pose trois questions — une fusion était-elle
 * fausse, une évidence est-elle partie en revue, un bon candidat a-t-il été
 * éliminé par la distance — et chacune se tranche en bougeant un nombre puis
 * en regardant ce que la base d'hier serait devenue. Sans ce rejeu, « bouger
 * un nombre » signifie relancer `enrich`, c'est-à-dire redemander à Google
 * des pages qu'on a déjà lues, et attendre le quart d'heure correspondant à
 * chaque itération. Ici, la même question coûte une seconde.
 *
 * Rien n'est écrit : la commande lit, calcule et affiche. Une calibration qui
 * modifierait la base en la mesurant détruirait sa propre référence.
 */

/** Une ligne d'enrichissement, telle que la calibration la relit. */
export interface StoredEnrichment {
  prospectId: string;
  denomination: string;
  denominationUsuelle: string | null;
  latitude: number | null;
  longitude: number | null;
  trade: Trade;
  status: EnrichmentRow['status'];
  matchedName: string | null;
  candidates: readonly ReviewCandidate[];
}

export interface ReplayedOutcome {
  status: 'ok' | 'ambiguous' | 'not_found';
  matchedName: string | null;
  /** Tous les candidats renotés, éliminés compris et motif à l'appui. */
  scored: ScoredCandidate[];
}

export interface Replay {
  prospectId: string;
  denomination: string;
  stored: { status: EnrichmentRow['status']; matchedName: string | null };
  /** `null` quand la ligne ne porte pas de quoi être rejouée. */
  replayed: ReplayedOutcome | null;
  /** Motif du refus de rejouer, `null` quand la ligne a été rejouée. */
  unreplayable: string | null;
  /** Le verdict a-t-il bougé — statut, ou fiche retenue ? */
  changed: boolean;
}

/**
 * La ligne porte-t-elle de quoi refaire le calcul ?
 *
 * Trois refus, et un cas qu'il ne faut surtout pas refuser :
 *
 * - `blocked` n'a rien lu du tout : Google a interposé une vérification avant
 *   la moindre fiche. Rejouer donnerait « introuvable », qui est faux.
 * - une fiche sans `latitude` **définie** vient d'un run antérieur à
 *   l'enregistrement complet. `null` est une coordonnée absente et se rejoue
 *   très bien ; `undefined` est un champ jamais écrit, et recalculer une
 *   distance sans lui rendrait un verdict faux présenté comme sûr.
 * - une fusion ou une ambiguïté sans aucun candidat gardé vient du même run
 *   ancien : le verdict existe, la matière a disparu.
 *
 * Un `not_found` sans candidat, lui, se rejoue : « rien n'a été retenu » dit
 * la même chose hier et aujourd'hui. Le refuser amputerait la calibration de
 * la moitié de sa population sans rien protéger.
 */
function refusalReason(row: StoredEnrichment): string | null {
  if (row.status === 'blocked') return 'run bloqué par Google : aucune fiche lue';
  for (const candidate of row.candidates) {
    if (candidate.latitude === undefined) {
      return 'ligne antérieure à l\u2019enregistrement complet des candidats';
    }
  }
  if (row.candidates.length === 0 && row.status !== 'not_found') {
    return 'ligne antérieure à l\u2019enregistrement complet des candidats';
  }
  return null;
}

/** Reconstruit la fiche Google à partir de ce qui en a été gardé. */
function toMapsCandidate(stored: ReviewCandidate): MapsCandidate {
  return {
    name: stored.name,
    address: stored.address,
    latitude: stored.latitude,
    longitude: stored.longitude,
    category: stored.category,
    phone: stored.phone,
    website: stored.website,
    rating: stored.rating,
    reviewCount: stored.reviewCount,
    placeId: stored.placeId,
    mapsUrl: stored.mapsUrl,
  };
}

export function replayEnrichment(row: StoredEnrichment, config: MatchingConfig): Replay {
  const base = {
    prospectId: row.prospectId,
    denomination: row.denomination,
    stored: { status: row.status, matchedName: row.matchedName },
  };

  const refusal = refusalReason(row);
  if (refusal !== null) {
    return { ...base, replayed: null, unreplayable: refusal, changed: false };
  }

  const subject: MatchSubject = {
    denomination: row.denomination,
    denominationUsuelle: row.denominationUsuelle,
    latitude: row.latitude,
    longitude: row.longitude,
  };
  const outcome = selectMatch(subject, row.candidates.map(toMapsCandidate), row.trade, config);
  const replayed: ReplayedOutcome = {
    status: outcome.kind,
    matchedName: outcome.kind === 'ok' ? outcome.candidate.name : null,
    scored: outcome.scored,
  };

  // La fiche retenue compte autant que le statut : deux runs peuvent tous
  // deux dire `ok` sur deux entreprises différentes, et c'est le numéro
  // composé qui change. Ne comparer que les statuts laisserait passer
  // précisément l'erreur qui se paie au téléphone.
  const changed =
    replayed.status !== row.status || replayed.matchedName !== row.matchedName;

  return { ...base, replayed, unreplayable: null, changed };
}

export interface ReplaySummary {
  replayed: number;
  unreplayable: number;
  changed: number;
  byStatus: { ok: number; ambiguous: number; not_found: number };
  /** Candidats écartés, par motif, sur les seules lignes rejouées. */
  eliminated: { distance: number; confiance: number };
}

export function summarizeReplays(replays: readonly Replay[]): ReplaySummary {
  const summary: ReplaySummary = {
    replayed: 0,
    unreplayable: 0,
    changed: 0,
    byStatus: { ok: 0, ambiguous: 0, not_found: 0 },
    eliminated: { distance: 0, confiance: 0 },
  };

  for (const replay of replays) {
    if (replay.replayed === null) {
      summary.unreplayable += 1;
      continue;
    }
    summary.replayed += 1;
    if (replay.changed) summary.changed += 1;
    summary.byStatus[replay.replayed.status] += 1;
    // Comptés sur le rejeu et non sur le champ stocké : c'est la
    // configuration qu'on est en train d'éprouver qui décide des
    // éliminations, pas celle qui a produit la ligne.
    for (const scored of replay.replayed.scored) {
      if (scored.rejectedFor !== null) summary.eliminated[scored.rejectedFor] += 1;
    }
  }

  return summary;
}
