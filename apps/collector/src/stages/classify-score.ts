import {
  classifyWebPresence,
  computeScore,
  normalizeCompanyName,
  normalizePhone,
  type PhoneKind,
  type ProbeResult,
  type ScoreLine,
  type WebPresenceCategory,
} from '@prospeo/core';

const FRANCHISE_MARKERS = ['franchise', 'reseau', 'groupe', 'sos', 'allo', '24h24'];

export interface ScoreRowInput {
  prospectId: string;
  declaredUrl: string | null;
  socialUrls: string[];
  probe: ProbeResult | null;
  rating: number | null;
  reviewCount: number | null;
  lastSocialPostAt: string | null;
  effectifCode: string | null;
  dateCreation: string | null;
  phoneRaw: string | null;
  denomination: string;
  isClosed: boolean;
}

export interface ScoreRow {
  prospectId: string;
  category: WebPresenceCategory;
  phoneKind: PhoneKind | null;
  total: number;
  breakdown: ScoreLine[];
  rulesetVersion: string;
}

function looksLikeFranchise(denomination: string): boolean {
  // Comparaison par MOTS ENTIERS, jamais par sous-chaine : « cavallo » se
  // termine par « allo » et « regroupement » contient « groupe ». Un patronyme
  // banal serait sinon penalise de 30 points comme enseigne de reseau.
  const words = normalizeCompanyName(denomination).split(' ');
  return words.some((word) => FRANCHISE_MARKERS.includes(word));
}

/**
 * `null` signifie « pas encore classable » : un domaine propre est déclaré
 * mais n'a pas été sondé. L'appelant doit lancer `probe` puis rejouer.
 */
export function buildScoreRow(input: ScoreRowInput, now: Date = new Date()): ScoreRow | null {
  const category = classifyWebPresence({
    declaredUrl: input.declaredUrl,
    socialUrls: input.socialUrls,
    probe: input.probe,
  });
  if (category === null) return null;

  const phone = normalizePhone(input.phoneRaw);
  const score = computeScore(
    {
      category,
      rating: input.rating,
      reviewCount: input.reviewCount,
      lastSocialPostAt: input.lastSocialPostAt,
      effectifCode: input.effectifCode,
      dateCreation: input.dateCreation,
      phoneKind: phone?.kind ?? null,
      isClosed: input.isClosed,
      isFranchise: looksLikeFranchise(input.denomination),
    },
    now,
  );

  return {
    prospectId: input.prospectId,
    category,
    phoneKind: phone?.kind ?? null,
    total: score.total,
    breakdown: score.breakdown,
    rulesetVersion: score.rulesetVersion,
  };
}

/**
 * Ce que `score` doit écrire pour un prospect.
 *
 * `erase` existe parce qu'un prospect qui redevient « en attente de sonde »
 * conserverait sinon le score du passage précédent, sans rien qui le
 * distingue d'un score frais. Une absence de score se dit par son absence.
 */
export type ScoreWrite =
  | { kind: 'score'; row: ScoreRow }
  | { kind: 'erase'; prospectId: string };

export function planScoreWrite(input: ScoreRowInput, now: Date = new Date()): ScoreWrite {
  const row = buildScoreRow(input, now);
  return row === null ? { kind: 'erase', prospectId: input.prospectId } : { kind: 'score', row };
}
