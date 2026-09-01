import type { Json } from '@prospeo/db';
import type { ScoreLine } from '@prospeo/core';

/**
 * Les trois blocs de la barre segmentée (§9.3).
 *
 * L'ordre est fixe et ne dépend pas des données : c'est ce qui permet de
 * distinguer d'un coup d'œil deux prospects à 71 dont l'un manque de
 * joignabilité et l'autre de vitalité. Un ordre dicté par les points ferait
 * bouger les couleurs d'une ligne à l'autre et détruirait cette lecture.
 *
 * `disqualifiant` en est absent volontairement : ce n'est pas un bloc de la
 * barre, et ses points pèsent déjà dans le total.
 */
export const SCORE_BAR_GROUPS = ['presence', 'vitalite', 'joignabilite'] as const;

export type ScoreBarGroup = (typeof SCORE_BAR_GROUPS)[number];

export interface ScoreSegment {
  group: ScoreBarGroup;
  /** Points bruts du bloc, négatifs compris — c'est le détail, pas la barre. */
  points: number;
  /** Largeur sur une piste de 100. La somme des trois vaut le total. */
  widthPercent: number;
}

export interface ScoreGroup {
  group: ScoreLine['group'];
  lines: ScoreLine[];
  subtotal: number;
}

const GROUPES_RECU: readonly ScoreLine['group'][] = [
  'presence',
  'vitalite',
  'joignabilite',
  'disqualifiant',
];

/**
 * Découpe le total en trois segments proportionnels aux points positifs.
 *
 * La barre mesure 100 de large et n'est remplie qu'à hauteur du total : une
 * barre pleine à 30 points se lirait comme un sans-faute. Le vide restant
 * n'est pas un défaut d'affichage, c'est l'information principale.
 *
 * Les blocs à points négatifs reçoivent une largeur nulle. Un segment de
 * largeur négative n'a pas de représentation ; un segment absent, lui, dit
 * exactement ce qui manque — et c'est le cas majoritaire dans la base, où la
 * joignabilité vaut −25 faute de téléphone connu.
 */
export function scoreSegments(breakdown: ScoreLine[], total: number): ScoreSegment[] {
  const points = new Map<ScoreBarGroup, number>(SCORE_BAR_GROUPS.map((g) => [g, 0]));
  for (const line of breakdown) {
    const courant = points.get(line.group as ScoreBarGroup);
    if (courant !== undefined) points.set(line.group as ScoreBarGroup, courant + line.points);
  }

  const positifs = SCORE_BAR_GROUPS.map((g) => Math.max(0, points.get(g) ?? 0));
  const sommePositifs = positifs.reduce((s, p) => s + p, 0);

  return SCORE_BAR_GROUPS.map((group, i) => ({
    group,
    points: points.get(group) ?? 0,
    // Le garde sur `sommePositifs` n'est pas décoratif : un prospect
    // `has_site` a −100 en présence et rien de positif ailleurs, ce qui
    // donnerait une division par zéro et des largeurs `NaN` — trois segments
    // invisibles au lieu d'une barre vide.
    widthPercent: sommePositifs === 0 ? 0 : ((positifs[i] ?? 0) / sommePositifs) * total,
  }));
}

/** Regroupe le barème pour le reçu du panneau, dans l'ordre de lecture. */
export function groupBreakdown(breakdown: ScoreLine[]): ScoreGroup[] {
  return GROUPES_RECU.map((group) => {
    const lines = breakdown.filter((l) => l.group === group);
    return { group, lines, subtotal: lines.reduce((s, l) => s + l.points, 0) };
  }).filter((g) => g.lines.length > 0);
}

/**
 * Le score stocké a-t-il été calculé avec une autre version du barème ?
 *
 * Le collector laisse en place le `prospect_score` d'un passage antérieur
 * quand il ne peut pas recalculer — c'est le trou des « scores périmés »
 * annoncé au §14 bis du socle. Rien en base ne marque cette obsolescence :
 * seule la comparaison des versions la révèle, et sans elle le dashboard
 * afficherait un chiffre faux avec l'aplomb d'un chiffre juste.
 */
export function isScoreStale(storedVersion: string, currentVersion: string): boolean {
  return storedVersion !== currentVersion;
}

function estScoreLine(value: unknown): value is ScoreLine {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as Record<string, unknown>;
  return (
    typeof o['code'] === 'string' &&
    typeof o['label'] === 'string' &&
    typeof o['points'] === 'number' &&
    GROUPES_RECU.includes(o['group'] as ScoreLine['group'])
  );
}

/**
 * Lit la colonne `prospect_score.breakdown`, typée `jsonb` donc `Json`.
 *
 * Une ligne malformée est écartée, pas propagée : la colonne n'a aucune
 * contrainte de forme, et une version future du barème pourrait y écrire des
 * groupes que ce code ne connaît pas. Perdre une ligne de détail est
 * acceptable ; faire tomber la fiche entière ne l'est pas.
 */
export function parseBreakdown(value: Json): ScoreLine[] {
  if (!Array.isArray(value)) return [];
  return value.filter(estScoreLine);
}
