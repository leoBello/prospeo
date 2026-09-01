import { describe, expect, it } from 'vitest';
import { applyReviewDecision } from './review.js';
import type { ReviewCandidate } from './enrich.js';

/** Horodatage de la ligne existante : la revue doit le reprendre tel quel. */
const ENRICHED_AT = '2026-08-15T09:30:00.000Z';

const candidates: ReviewCandidate[] = [
  {
    name: 'Allard Plomberie',
    address: '11 rue Auguste Brizeux',
    phone: '02 40 00 00 00',
    website: 'https://facebook.com/allard',
    mapsUrl: 'https://maps.google.com/1',
    rating: 4.6,
    placeId: 'ChIJabc',
    confidence: 0.78,
    lines: [],
  },
  {
    name: 'Allardin Chauffage',
    address: null,
    phone: null,
    website: null,
    mapsUrl: 'https://maps.google.com/2',
    rating: null,
    placeId: null,
    confidence: 0.61,
    lines: [],
  },
];

describe('applyReviewDecision', () => {
  it('promeut le candidat retenu en enrichissement confirmé', () => {
    const row = applyReviewDecision('p1', candidates, { kind: 'accept', index: 0 }, ENRICHED_AT);
    expect(row.status).toBe('ok');
    expect(row.matched_name).toBe('Allard Plomberie');
    expect(row.phone_e164).toBe('+33240000000');
    expect(row.candidates).toEqual([]);
  });

  it('conserve la note et l identifiant de lieu du candidat retenu', () => {
    // Sans eux, un prospect tranché à la main perdrait les points de vitalité
    // que le barème tire de la note, et serait moins bien classé qu'un
    // prospect apparié automatiquement à information identique.
    const row = applyReviewDecision('p1', candidates, { kind: 'accept', index: 0 }, ENRICHED_AT);
    expect(row.rating).toBe(4.6);
    expect(row.place_id).toBe('ChIJabc');
  });

  it('reprend l horodatage d enrichissement au lieu de le rafraîchir', () => {
    // Trancher un doute n'enrichit rien : aucune requête n'est partie chez
    // Google. Rafraîchir cet horodatage ferait compter la revue dans le
    // plafond journalier de `enrich`, et amputerait le run du lendemain.
    for (const decision of [
      { kind: 'accept', index: 0 } as const,
      { kind: 'reject' } as const,
      { kind: 'skip' } as const,
    ]) {
      expect(applyReviewDecision('p1', candidates, decision, ENRICHED_AT).enriched_at).toBe(
        ENRICHED_AT,
      );
    }
  });

  it('marque not_found quand aucun candidat ne convient', () => {
    const row = applyReviewDecision('p1', candidates, { kind: 'reject' }, ENRICHED_AT);
    expect(row.status).toBe('not_found');
    expect(row.phone_e164).toBeNull();
    expect(row.rating).toBeNull();
  });

  it('laisse la ligne intacte quand la décision est reportée', () => {
    const row = applyReviewDecision('p1', candidates, { kind: 'skip' }, ENRICHED_AT);
    expect(row.status).toBe('ambiguous');
    expect(row.candidates).toHaveLength(2);
  });

  it('refuse un indice hors bornes plutôt que d écrire une fiche vide', () => {
    expect(() =>
      applyReviewDecision('p1', candidates, { kind: 'accept', index: 9 }, ENRICHED_AT),
    ).toThrow();
  });

  it('refuse un indice négatif, que produit une saisie de « 0 »', () => {
    // L'affichage numérote à partir de 1 : taper « 0 » donne l'indice -1.
    expect(() =>
      applyReviewDecision('p1', candidates, { kind: 'accept', index: -1 }, ENRICHED_AT),
    ).toThrow();
  });
});
