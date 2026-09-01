import { describe, expect, it } from 'vitest';
import { applyReviewDecision } from './review.js';
import type { ReviewCandidate } from './enrich.js';

const candidates: ReviewCandidate[] = [
  {
    name: 'Allard Plomberie',
    address: '11 rue Auguste Brizeux',
    phone: '02 40 00 00 00',
    website: 'https://facebook.com/allard',
    mapsUrl: 'https://maps.google.com/1',
    confidence: 0.78,
    lines: [],
  },
  {
    name: 'Allardin Chauffage',
    address: null,
    phone: null,
    website: null,
    mapsUrl: 'https://maps.google.com/2',
    confidence: 0.61,
    lines: [],
  },
];

describe('applyReviewDecision', () => {
  it('promeut le candidat retenu en enrichissement confirmé', () => {
    const row = applyReviewDecision('p1', candidates, { kind: 'accept', index: 0 });
    expect(row.status).toBe('ok');
    expect(row.matched_name).toBe('Allard Plomberie');
    expect(row.phone_e164).toBe('+33240000000');
    expect(row.candidates).toEqual([]);
  });

  it('marque not_found quand aucun candidat ne convient', () => {
    const row = applyReviewDecision('p1', candidates, { kind: 'reject' });
    expect(row.status).toBe('not_found');
    expect(row.phone_e164).toBeNull();
  });

  it('laisse la ligne intacte quand la décision est reportée', () => {
    const row = applyReviewDecision('p1', candidates, { kind: 'skip' });
    expect(row.status).toBe('ambiguous');
    expect(row.candidates).toHaveLength(2);
  });

  it('refuse un indice hors bornes plutôt que d écrire une fiche vide', () => {
    expect(() => applyReviewDecision('p1', candidates, { kind: 'accept', index: 9 })).toThrow();
  });
});
