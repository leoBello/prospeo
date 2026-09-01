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
  /**
   * Statut de la ligne `prospect_enrichment`, ou `null` si le prospect n'en a
   * aucune.
   *
   * Sans lui, quatre situations sans rapport se confondaient — jamais
   * enrichi, bloqué par un captcha, en attente de revue manuelle, ou
   * réellement introuvable sur Google Maps — et produisaient toutes
   * « aucune présence web » à 20 points. Seule la dernière est une
   * observation ; le cas `blocked` est le plus net, puisqu'on sait alors
   * qu'on a été *empêché* de regarder.
   *
   * C'est la pathologie que ce chantier existe pour corriger, décrite au §1
   * du spec : « classés aucune présence web non pas parce qu'ils n'ont pas de
   * site, mais parce que personne n'a regardé ».
   */
  enrichmentStatus: 'ok' | 'not_found' | 'ambiguous' | 'blocked' | null;
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
  /**
   * Rien à noter, et la raison distingue deux populations qui n'appellent pas
   * la même action : `enrichment` attend un run de `enrich`, `probe` attend un
   * run de `probe`. Les confondre sous un seul « en attente » cacherait
   * laquelle des deux commandes relancer.
   */
  | { kind: 'erase'; prospectId: string; reason: 'enrichment' | 'probe' };

/**
 * Un prospect ne se note que si l'on a effectivement regardé.
 *
 * `ok` et `not_found` sont deux observations : dans le premier cas on a
 * trouvé la fiche, dans le second on a cherché et conclu à son absence. Tout
 * le reste — pas de ligne d'enrichissement, run bloqué par un captcha, cas
 * ambigu que personne n'a encore tranché — est une absence de regard, et
 * écrire une catégorie dessus serait affirmer ce qu'on ne sait pas.
 */
function looked(status: ScoreRowInput['enrichmentStatus']): boolean {
  return status === 'ok' || status === 'not_found';
}

export function planScoreWrite(input: ScoreRowInput, now: Date = new Date()): ScoreWrite {
  if (!looked(input.enrichmentStatus)) {
    return { kind: 'erase', prospectId: input.prospectId, reason: 'enrichment' };
  }
  const row = buildScoreRow(input, now);
  return row === null
    ? { kind: 'erase', prospectId: input.prospectId, reason: 'probe' }
    : { kind: 'score', row };
}
