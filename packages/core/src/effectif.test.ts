import { describe, expect, it } from 'vitest';
import { minHeadcount } from './effectif.js';

describe('minHeadcount', () => {
  it('traduit les codes INSEE en effectif minimal', () => {
    expect(minHeadcount('00')).toBe(0);
    expect(minHeadcount('01')).toBe(1);
    expect(minHeadcount('02')).toBe(3);
    expect(minHeadcount('11')).toBe(10);
    expect(minHeadcount('42')).toBe(1000);
  });

  it('renvoie null pour un effectif non renseigné', () => {
    expect(minHeadcount('NN')).toBeNull();
    expect(minHeadcount(null)).toBeNull();
    expect(minHeadcount('zz')).toBeNull();
  });
});
