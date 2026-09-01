import { bestNameMatch, nameVariants } from './name-match.js';
import { normalizeCompanyName } from './normalize.js';
import type { Trade } from './types.js';

/** Rayon moyen de la Terre, en mètres. */
const EARTH_RADIUS_M = 6_371_000;

/** Ce dont l'appariement a besoin, côté Sirene. */
export interface MatchSubject {
  denomination: string;
  denominationUsuelle: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Une fiche Google Maps, telle qu'extraite et normalisée. */
export interface MapsCandidate {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  placeId: string | null;
  mapsUrl: string;
}

/** Une ligne de justification, affichable telle quelle. */
export interface MatchLine {
  code: 'nom' | 'distance' | 'categorie';
  label: string;
  /** Contribution effective à la confiance, déjà pondérée. */
  points: number;
}

export interface MatchScore {
  /** 0 à 1. */
  confidence: number;
  nameSimilarity: number;
  /** La variante de nom qui a emporté la décision. */
  matchedVariant: string | null;
  /** `null` quand une des deux positions manque. */
  distanceM: number | null;
  categoryMatch: boolean;
  lines: MatchLine[];
}

export interface ScoredCandidate {
  candidate: MapsCandidate;
  score: MatchScore;
}

export type MatchOutcome =
  | { kind: 'ok'; candidate: MapsCandidate; score: MatchScore }
  | { kind: 'ambiguous'; scored: ScoredCandidate[] }
  | { kind: 'not_found' };

export interface MatchingConfig {
  version: string;
  nameWeight: number;
  distanceWeight: number;
  categoryWeight: number;
  /** Au-delà, le candidat est éliminé quel que soit son nom. */
  maxDistanceM: number;
  highThreshold: number;
  lowThreshold: number;
}

/**
 * Points de départ explicitement destinés à bouger.
 *
 * Ils seront calibrés sur les 25 premiers prospects réels, à l'étape 6 du
 * plan. La version est portée dans l'objet pour qu'un changement de réglage
 * soit traçable dans les données, comme pour le barème de notation.
 */
export const MATCHING_CONFIG: MatchingConfig = {
  version: 'v1',
  nameWeight: 0.6,
  distanceWeight: 0.25,
  categoryWeight: 0.15,
  maxDistanceM: 300,
  highThreshold: 0.85,
  lowThreshold: 0.55,
};

/** Distance orthodromique en mètres. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Jetons de métier trop génériques pour porter une identité d'entreprise. */
function genericTokens(trade: Trade): string[] {
  return [trade.slug, trade.label, ...trade.keywords, ...trade.mapsQueries].flatMap((word) =>
    normalizeCompanyName(word).split(' '),
  );
}

/**
 * Le libellé de catégorie Google recoupe-t-il le métier attendu ?
 *
 * Se limite à `categoryLabels`, volontairement plus étroit que `keywords` :
 * `keywords` contient des mots comme « dépannage », choisis pour être
 * fréquents dans les noms d'artisans — ce qui en fait le pire discriminant
 * de catégorie possible, puisqu'il qualifie tout autant l'électroménager,
 * l'informatique ou l'automobile.
 */
function matchesCategory(category: string | null, trade: Trade): boolean {
  if (category === null) return false;
  const normalized = normalizeCompanyName(category);
  if (normalized === '') return false;
  return trade.categoryLabels.some((word) => {
    const target = normalizeCompanyName(word);
    return target !== '' && normalized.includes(target);
  });
}


export function scoreCandidate(
  subject: MatchSubject,
  candidate: MapsCandidate,
  trade: Trade,
  config: MatchingConfig,
): MatchScore {
  const generic = genericTokens(trade);
  const variants = nameVariants(subject.denomination, subject.denominationUsuelle);
  const name = bestNameMatch(variants, candidate.name, generic);

  const distanceM =
    subject.latitude === null ||
    subject.longitude === null ||
    candidate.latitude === null ||
    candidate.longitude === null
      ? null
      : haversineMeters(
          subject.latitude,
          subject.longitude,
          candidate.latitude,
          candidate.longitude,
        );

  // Une distance inconnue ne vaut ni bonus ni malus : elle ne prouve rien.
  const proximity =
    distanceM === null
      ? 0
      : Math.max(0, 1 - Math.min(distanceM, config.maxDistanceM) / config.maxDistanceM);

  const categoryMatch = matchesCategory(candidate.category, trade);

  const namePoints = config.nameWeight * name.score;
  const distancePoints = config.distanceWeight * proximity;
  const categoryPoints = config.categoryWeight * (categoryMatch ? 1 : 0);

  const lines: MatchLine[] = [
    {
      code: 'nom',
      label:
        name.variant === null
          ? 'nom : aucune variante exploitable'
          : `nom ${name.score.toFixed(2)} via « ${name.variant} »`,
      points: namePoints,
    },
    {
      code: 'distance',
      label: distanceM === null ? 'distance inconnue' : `${Math.round(distanceM)} m`,
      points: distancePoints,
    },
    {
      code: 'categorie',
      label:
        candidate.category === null
          ? 'catégorie absente'
          : `catégorie « ${candidate.category} »${categoryMatch ? ' ✓' : ' ✗'}`,
      points: categoryPoints,
    },
  ];

  return {
    confidence: namePoints + distancePoints + categoryPoints,
    nameSimilarity: name.score,
    matchedVariant: name.variant,
    distanceM,
    categoryMatch,
    lines,
  };
}

/**
 * Choisit un candidat, ou refuse de choisir.
 *
 * Deux candidats au-dessus du seuil haut ne fusionnent jamais : quand deux
 * fiches se disputent un prospect, la confiance élevée est le symptôme du
 * problème, pas sa résolution. Un faux appariement ne se voit pas dans les
 * statistiques — il se voit au téléphone, et l'appel est perdu.
 */
export function selectMatch(
  subject: MatchSubject,
  candidates: readonly MapsCandidate[],
  trade: Trade,
  config: MatchingConfig,
): MatchOutcome {
  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const score = scoreCandidate(subject, candidate, trade, config);
    // Au-delà de la distance maximale, deux homonymes sont deux entreprises.
    if (score.distanceM !== null && score.distanceM > config.maxDistanceM) continue;
    if (score.confidence < config.lowThreshold) continue;
    scored.push({ candidate, score });
  }

  if (scored.length === 0) return { kind: 'not_found' };

  scored.sort((a, b) => b.score.confidence - a.score.confidence);
  const confident = scored.filter((s) => s.score.confidence >= config.highThreshold);

  if (confident.length === 1) {
    const only = confident[0];
    if (only === undefined) return { kind: 'not_found' };
    return { kind: 'ok', candidate: only.candidate, score: only.score };
  }

  return { kind: 'ambiguous', scored };
}
