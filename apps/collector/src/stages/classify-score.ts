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

const FRANCHISE_MARKERS = ['franchise', 'reseau', 'groupe', 'sos ', 'allo ', '24h24'];

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
  const normalized = `${normalizeCompanyName(denomination)} `;
  return FRANCHISE_MARKERS.some((marker) => normalized.includes(marker));
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
