import { normalizePhone } from '@prospeo/core';
import type { EnrichmentRow, ReviewCandidate } from './enrich.js';

// `ReviewCandidate` est déclaré dans `stages/enrich.ts` et importé ici, pas
// l'inverse : `EnrichmentRow.candidates` le référence, et le déclarer dans
// `review.ts` ferait dépendre l'étage de la commande de revue. C'est un ALIAS
// de type et non une interface — une interface n'a pas de signature d'index
// implicite, donc `ReviewCandidate[]` ne serait pas assignable au type `Json`
// de la colonne `jsonb` qui la stocke. Même piège que `ScoreLine` dans
// `packages/core`.

export type ReviewDecision =
  | { kind: 'accept'; index: number }
  | { kind: 'reject' }
  | { kind: 'skip' };

/**
 * Traduit une décision humaine en ligne d'enrichissement.
 *
 * Pure et testée à dessein : c'est elle que le dashboard réutilisera quand il
 * offrira la même file. Seule la coquille interactive sera réécrite.
 */
export function applyReviewDecision(
  prospectId: string,
  candidates: readonly ReviewCandidate[],
  decision: ReviewDecision,
  /**
   * Horodatage d'enrichissement de la ligne existante, repris tel quel.
   *
   * Trancher un doute n'est pas enrichir : aucune requête n'est partie chez
   * Google. Or le plafond journalier de `enrich` compte les lignes dont
   * `enriched_at` tombe aujourd'hui — le réécrire ferait donc consommer au
   * scraping le quota d'une revue purement humaine, et une session de vingt
   * cas amputerait d'autant le run du lendemain.
   */
  enrichedAt: string,
): EnrichmentRow {
  const base: EnrichmentRow = {
    prospect_id: prospectId,
    source: 'google_maps',
    matched_name: null,
    match_confidence: null,
    phone_e164: null,
    phone_kind: null,
    declared_url: null,
    // Pas de `social_urls`, pour la même raison qu'à l'étage `enrich` : la
    // revue ne connaît pas cette colonne, et la réécrire à `[]` effacerait sur
    // conflit une donnée posée par ailleurs.
    rating: null,
    review_count: null,
    place_id: null,
    maps_url: null,
    candidates: [],
    status: 'not_found',
    enriched_at: enrichedAt,
  };

  if (decision.kind === 'reject') return base;

  if (decision.kind === 'skip') {
    return { ...base, status: 'ambiguous', candidates: [...candidates] };
  }

  const chosen = candidates[decision.index];
  if (chosen === undefined) {
    // Écrire une fiche vide sur un indice erroné effacerait des candidats que
    // personne n'a écartés.
    throw new Error(`Aucun candidat à l'indice ${decision.index}`);
  }

  const phone = normalizePhone(chosen.phone);
  return {
    ...base,
    status: 'ok',
    matched_name: chosen.name,
    match_confidence: chosen.confidence,
    phone_e164: phone?.e164 ?? null,
    phone_kind: phone?.kind ?? null,
    declared_url: chosen.website,
    maps_url: chosen.mapsUrl,
    // La note alimente les points de vitalité du barème : la perdre ici
    // classerait moins bien un prospect tranché à la main qu'un prospect
    // apparié automatiquement, à information identique.
    rating: chosen.rating,
    place_id: chosen.placeId,
  };
}
