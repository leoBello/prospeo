import { minHeadcount } from './effectif.js';
import type { ScoreInput, ScoreLine, ScoreResult, WebPresenceCategory } from './types.js';

/**
 * Barème versionné. Modifier ces valeurs impose d'incrémenter `version`,
 * puis de rejouer l'étage `score` — l'opération est pure et gratuite.
 */
const PRESENCE_POINTS: Record<WebPresenceCategory, number> = {
  social_only: 45,
  dead_site: 40,
  none: 35,
  directory_only: 30,
  has_site: -100,
};

export const SCORING_RULESET = {
  version: 'v2',
  presence: PRESENCE_POINTS,
  /**
   * La note seule, sans condition sur le nombre d'avis.
   *
   * En v1 cette règle exigeait les deux, ce qui la rendait inatteignable :
   * Google ne publie plus le nombre d'avis (§4.5 du spec), le scraper écrit
   * donc `null` en dur, et la note — que ce chantier a spécifiquement
   * bataillé pour extraire, puis pour préserver à travers la revue manuelle —
   * ne rapportait structurellement jamais un point.
   */
  reputation: { minRating: 4, points: 25 },
  /**
   * INERTE tant que Google ne republie pas le nombre d'avis.
   *
   * Conservée plutôt que supprimée : le barème est versionné, la donnée peut
   * revenir, et une règle inerte qui dit pourquoi vaut mieux qu'une règle
   * disparue dont personne ne saura qu'elle a existé.
   */
  reviewsVolume: { minReviews: 30, points: 10 },
  /**
   * INERTE faute d'écrivain : aucun étage ne renseigne
   * `web_presence.last_social_post_at`. Le §5.2 du socle la prévoyait à la
   * charge de `probe`, qui devait lire la date du dernier contenu public
   * d'une page Facebook ; cette source n'a pas été construite. Conservée pour
   * la même raison que ci-dessus.
   */
  socialFresh: { maxAgeDays: 90, points: 15 },
  staff: { minHeadcount: 3, points: 10 },
  age: { minYears: 3, maxYears: 20, points: 10 },
  phone: { mobile: 20, landline: 10, none: -25 },
  franchise: -30,
} as const;

const PRESENCE_LABELS: Record<WebPresenceCategory, string> = {
  social_only: 'Page sociale, aucun site',
  dead_site: 'Site en panne ou obsolète',
  none: 'Aucune présence web',
  directory_only: 'Fiche annuaire uniquement',
  has_site: 'Site correct et vivant',
};

function yearsBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (365.25 * 24 * 3600 * 1000);
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / (24 * 3600 * 1000);
}

function parseDate(iso: string | null): Date | null {
  if (iso === null) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function computeScore(input: ScoreInput, now: Date = new Date()): ScoreResult {
  const R = SCORING_RULESET;

  if (input.isClosed) {
    return {
      total: 0,
      rulesetVersion: R.version,
      breakdown: [
        { code: 'closed', label: 'Établissement cessé', points: 0, group: 'disqualifiant' },
      ],
    };
  }

  const lines: ScoreLine[] = [
    {
      code: `presence_${input.category}`,
      label: PRESENCE_LABELS[input.category],
      points: R.presence[input.category],
      group: 'presence',
    },
  ];

  if (input.rating !== null && input.rating >= R.reputation.minRating) {
    // Le libellé mentionne le nombre d'avis quand il existe, sans en dépendre :
    // il n'est plus publié par Google, mais le barème est versionné et la
    // donnée peut revenir.
    const suffixe = input.reviewCount === null ? '' : ` sur ${input.reviewCount} avis`;
    lines.push({
      code: 'reputation',
      label: `${input.rating.toFixed(1)} ★${suffixe}`,
      points: R.reputation.points,
      group: 'vitalite',
    });
  }

  if (input.reviewCount !== null && input.reviewCount >= R.reviewsVolume.minReviews) {
    lines.push({
      code: 'reviews_volume',
      label: `${input.reviewCount} avis`,
      points: R.reviewsVolume.points,
      group: 'vitalite',
    });
  }

  const lastPost = parseDate(input.lastSocialPostAt);
  if (lastPost !== null) {
    // Borne basse indispensable : sans elle une date future satisfait `<= 90`
    // et produit un libellé absurde (« il y a -12 j »).
    const postAge = daysBetween(lastPost, now);
    if (postAge >= 0 && postAge <= R.socialFresh.maxAgeDays) {
      lines.push({
        code: 'social_fresh',
        label: `Publication il y a ${Math.round(postAge)} j`,
        points: R.socialFresh.points,
        group: 'vitalite',
      });
    }
  }

  const headcount = minHeadcount(input.effectifCode);
  if (headcount !== null && headcount >= R.staff.minHeadcount) {
    lines.push({
      code: 'staff',
      label: `Au moins ${headcount} salariés`,
      points: R.staff.points,
      group: 'vitalite',
    });
  }

  const created = parseDate(input.dateCreation);
  if (created !== null) {
    const age = yearsBetween(created, now);
    if (age >= R.age.minYears && age <= R.age.maxYears) {
      lines.push({
        code: 'age',
        label: `Créée il y a ${Math.floor(age)} ans`,
        points: R.age.points,
        group: 'vitalite',
      });
    }
  }

  if (input.phoneKind === 'mobile') {
    lines.push({ code: 'phone_mobile', label: 'Mobile trouvé', points: R.phone.mobile, group: 'joignabilite' });
  } else if (input.phoneKind === 'landline') {
    lines.push({ code: 'phone_landline', label: 'Fixe uniquement', points: R.phone.landline, group: 'joignabilite' });
  } else {
    lines.push({ code: 'phone_none', label: 'Aucun téléphone', points: R.phone.none, group: 'joignabilite' });
  }

  if (input.isFranchise) {
    lines.push({ code: 'franchise', label: 'Enseigne de réseau', points: R.franchise, group: 'disqualifiant' });
  }

  const raw = lines.reduce((sum, line) => sum + line.points, 0);
  return { total: Math.max(0, Math.min(100, raw)), breakdown: lines, rulesetVersion: R.version };
}
