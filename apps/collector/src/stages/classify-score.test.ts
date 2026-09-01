import { describe, expect, it } from 'vitest';
import { buildScoreRow, planScoreWrite, type ScoreRowInput } from './classify-score.js';

const NOW = new Date('2026-09-01T00:00:00Z');

const base: ScoreRowInput = {
  prospectId: 'p1',
  declaredUrl: null,
  socialUrls: [],
  probe: null,
  rating: null,
  reviewCount: null,
  lastSocialPostAt: null,
  effectifCode: null,
  dateCreation: null,
  phoneRaw: null,
  denomination: 'PLOMBERIE MARTIN',
  isClosed: false,
};

describe('buildScoreRow', () => {
  it('classe et note un prospect sans presence web', () => {
    const row = buildScoreRow(base, NOW)!;
    expect(row.category).toBe('none');
    expect(row.total).toBe(10); // 35 présence - 25 absence de téléphone
    expect(row.rulesetVersion).toBe('v1');
  });

  it('valorise une page Facebook avec mobile et bonne reputation', () => {
    const row = buildScoreRow(
      {
        ...base,
        declaredUrl: 'https://facebook.com/plomberiemartin',
        rating: 4.6,
        reviewCount: 23,
        phoneRaw: '06 12 34 56 78',
        dateCreation: '2016-03-01',
      },
      NOW,
    )!;
    expect(row.category).toBe('social_only');
    expect(row.total).toBe(100); // 45 + 25 + 10 + 20 = 100
    expect(row.phoneKind).toBe('mobile');
  });

  it('renvoie null quand un domaine propre n a pas encore ete sonde', () => {
    expect(buildScoreRow({ ...base, declaredUrl: 'https://plomberie-martin.fr' }, NOW)).toBeNull();
  });

  it('disqualifie un site sain', () => {
    const row = buildScoreRow(
      {
        ...base,
        declaredUrl: 'https://plomberie-martin.fr',
        phoneRaw: '02 40 12 34 56',
        probe: {
          url: 'https://plomberie-martin.fr',
          reachable: true,
          httpStatus: 200,
          isHttps: true,
          finalUrl: 'https://plomberie-martin.fr/',
          hasViewportMeta: true,
          isParked: false,
        },
      },
      NOW,
    )!;
    expect(row.category).toBe('has_site');
    expect(row.total).toBe(0);
  });

  it('detecte une enseigne de reseau', () => {
    const row = buildScoreRow({ ...base, denomination: 'SOS PLOMBIER FRANCHISE' }, NOW)!;
    expect(row.breakdown.some((l) => l.code === 'franchise')).toBe(true);
  });

  it('ne prend pas un patronyme terminant par allo pour une franchise', () => {
    const row = buildScoreRow({ ...base, denomination: 'SARL CAVALLO' }, NOW)!;
    expect(row.breakdown.some((l) => l.code === 'franchise')).toBe(false);
  });

  it('ne prend pas regroupement pour groupe', () => {
    const row = buildScoreRow({ ...base, denomination: 'REGROUPEMENT DES ARTISANS' }, NOW)!;
    expect(row.breakdown.some((l) => l.code === 'franchise')).toBe(false);
  });

  it('ignore un telephone illisible', () => {
    const row = buildScoreRow({ ...base, phoneRaw: '12345' }, NOW)!;
    expect(row.phoneKind).toBeNull();
  });
});

/** Entrée minimale valide, surchargée cas par cas. */
function input(over: Partial<ScoreRowInput> = {}): ScoreRowInput {
  return {
    prospectId: 'p1',
    declaredUrl: null,
    socialUrls: [],
    probe: null,
    rating: null,
    reviewCount: null,
    lastSocialPostAt: null,
    effectifCode: null,
    dateCreation: null,
    phoneRaw: null,
    denomination: 'PLOMBERIE MARTIN',
    isClosed: false,
    ...over,
  };
}

describe('planScoreWrite', () => {
  it('demande une écriture de score quand le prospect est classable', () => {
    const write = planScoreWrite(input());
    expect(write.kind).toBe('score');
    if (write.kind !== 'score') throw new Error('inattendu');
    expect(write.row.category).toBe('none');
  });

  it('demande un effacement quand un domaine propre attend la sonde', () => {
    // `declaredUrl` sur un domaine propre et `probe` à null : c'est
    // exactement le cas que `enrich` va créer en masse.
    const write = planScoreWrite(input({ declaredUrl: 'https://exemple.fr' }));
    expect(write).toEqual({ kind: 'erase', prospectId: 'p1' });
  });

  it('ne demande pas d effacement pour une URL sociale, classable sans sonde', () => {
    const write = planScoreWrite(input({ declaredUrl: 'https://facebook.com/plomberie' }));
    expect(write.kind).toBe('score');
  });
});
