import { describe, expect, it } from 'vitest';
import { computeScore, SCORING_RULESET } from './scoring.js';
import type { ScoreInput } from './types.js';

const NOW = new Date('2026-09-01T00:00:00Z');

const base: ScoreInput = {
  category: 'none',
  rating: null,
  reviewCount: null,
  lastSocialPostAt: null,
  effectifCode: null,
  dateCreation: null,
  phoneKind: null,
  isClosed: false,
  isFranchise: false,
};

describe('computeScore', () => {
  it('expose la version du bareme', () => {
    expect(SCORING_RULESET.version).toBe('v1');
    expect(computeScore(base, NOW).rulesetVersion).toBe('v1');
  });

  it('attribue les points de presence web', () => {
    const line = (c: ScoreInput['category']) =>
      computeScore({ ...base, category: c, phoneKind: 'mobile' }, NOW)
        .breakdown.find((l) => l.group === 'presence')?.points;
    expect(line('social_only')).toBe(45);
    expect(line('dead_site')).toBe(40);
    expect(line('none')).toBe(35);
    expect(line('directory_only')).toBe(30);
    expect(line('has_site')).toBe(-100);
  });

  it('borne le total entre 0 et 100', () => {
    expect(computeScore({ ...base, category: 'has_site' }, NOW).total).toBe(0);
    const max = computeScore(
      {
        category: 'social_only',
        rating: 4.8,
        reviewCount: 42,
        lastSocialPostAt: '2026-08-20',
        effectifCode: '02',
        dateCreation: '2016-03-01',
        phoneKind: 'mobile',
        isClosed: false,
        isFranchise: false,
      },
      NOW,
    );
    expect(max.total).toBe(100);
  });

  it('recompense la reputation etablie', () => {
    const r = computeScore({ ...base, rating: 4.6, reviewCount: 23 }, NOW);
    expect(r.breakdown.find((l) => l.code === 'reputation')?.points).toBe(25);
    expect(r.breakdown.find((l) => l.code === 'reviews_volume')).toBeUndefined();
  });

  it('ajoute le volume d avis a partir de 30', () => {
    const r = computeScore({ ...base, rating: 4.6, reviewCount: 30 }, NOW);
    expect(r.breakdown.find((l) => l.code === 'reviews_volume')?.points).toBe(10);
  });

  it('ignore une bonne note avec trop peu d avis', () => {
    const r = computeScore({ ...base, rating: 4.9, reviewCount: 3 }, NOW);
    expect(r.breakdown.find((l) => l.code === 'reputation')).toBeUndefined();
  });

  it('recompense une activite sociale de moins de 90 jours', () => {
    expect(
      computeScore({ ...base, lastSocialPostAt: '2026-08-20' }, NOW)
        .breakdown.find((l) => l.code === 'social_fresh')?.points,
    ).toBe(15);
    expect(
      computeScore({ ...base, lastSocialPostAt: '2026-01-10' }, NOW)
        .breakdown.find((l) => l.code === 'social_fresh'),
    ).toBeUndefined();
  });

  it('traite l anciennete comme une fenetre de 3 a 20 ans', () => {
    const age = (d: string) =>
      computeScore({ ...base, dateCreation: d }, NOW).breakdown.find((l) => l.code === 'age');
    expect(age('2016-03-01')?.points).toBe(10);
    expect(age('2024-06-01')).toBeUndefined();
    expect(age('1995-01-01')).toBeUndefined();
  });

  it('recompense un effectif d au moins 3', () => {
    expect(
      computeScore({ ...base, effectifCode: '02' }, NOW).breakdown.find((l) => l.code === 'staff')
        ?.points,
    ).toBe(10);
    expect(
      computeScore({ ...base, effectifCode: '01' }, NOW).breakdown.find((l) => l.code === 'staff'),
    ).toBeUndefined();
  });

  it('note la joignabilite, y compris negativement', () => {
    const pts = (k: ScoreInput['phoneKind']) =>
      computeScore({ ...base, phoneKind: k }, NOW).breakdown.find((l) => l.group === 'joignabilite')
        ?.points;
    expect(pts('mobile')).toBe(20);
    expect(pts('landline')).toBe(10);
    expect(pts(null)).toBe(-25);
  });

  it('penalise une franchise', () => {
    expect(
      computeScore({ ...base, isFranchise: true }, NOW).breakdown.find(
        (l) => l.code === 'franchise',
      )?.points,
    ).toBe(-30);
  });

  it('ignore une publication datee dans le futur', () => {
    expect(
      computeScore({ ...base, lastSocialPostAt: '2026-10-15' }, NOW)
        .breakdown.find((l) => l.code === 'social_fresh'),
    ).toBeUndefined();
  });

  it('disqualifie un etablissement ferme, sans autre ligne', () => {
    const r = computeScore({ ...base, category: 'social_only', isClosed: true }, NOW);
    expect(r.total).toBe(0);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0]?.code).toBe('closed');
  });
});
