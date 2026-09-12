import { describe, expect, it } from 'vitest';
import type { ProspectView } from './prospect.js';
import { MAX_ROWS_PER_LIST, buildToday, followUpReason, matchesQuery } from './today.js';

const AUJOURDHUI = new Date('2026-09-01T09:00:00');

function vue(patch: Partial<ProspectView> & { id: string }): ProspectView {
  return {
    siret: '00000000000000',
    denomination: 'ENTREPRISE',
    denominationUsuelle: null,
    tradeSlug: 'plombier',
    address: '1 rue X',
    postalCode: '44000',
    city: 'NANTES',
    dateCreation: null,
    effectifCode: null,
    isClosed: false,
    discoveredAt: '2026-09-01T00:00:00Z',
    score: null,
    presence: null,
    enrichment: null,
    pipeline: null,
    site: null,
    messages: [],
    ...patch,
  };
}

const scoreDe = (total: number) => ({
  total,
  rulesetVersion: 'v2',
  computedAt: '2026-09-01T00:00:00Z',
  breakdown: [
    { code: 'presence_none', label: 'Aucune présence web', points: 35, group: 'presence' as const },
    { code: 'staff', label: 'Au moins 3 salariés', points: 10, group: 'vitalite' as const },
  ],
});

describe('followUpReason', () => {
  it('nomme le nombre de jours de retard, pour que la ligne dise pourquoi elle est la', () => {
    expect(followUpReason('2026-08-29T10:00:00', AUJOURDHUI)).toEqual({
      key: 'today.reason.followUp.late',
      params: { days: 3, count: 3 },
    });
  });

  it('distingue une relance du jour d une relance en retard', () => {
    expect(followUpReason('2026-09-01T23:00:00', AUJOURDHUI).key).toBe(
      'today.reason.followUp.today',
    );
  });

  it('compte les jours en dates civiles et non en tranches de 24 h', () => {
    // 23 h d'écart mais deux jours différents : « hier soir » est en retard
    // d'un jour, pas de zéro. Une soustraction de millisecondes dirait zéro.
    expect(followUpReason('2026-08-31T23:00:00', AUJOURDHUI)).toEqual({
      key: 'today.reason.followUp.late',
      params: { days: 1, count: 1 },
    });
  });

  it('traite une relance sans date comme telle, et non comme une relance du jour', () => {
    expect(followUpReason(null, AUJOURDHUI).key).toBe('today.reason.followUp.undated');
  });
});

describe('buildToday', () => {
  it('ne retient comme relance due que ce qui est echu, jamais une echeance a venir', () => {
    const rows = [
      vue({ id: 'due', pipeline: { status: 'relance', nextActionAt: '2026-08-30T10:00:00', updatedAt: '2026-08-30T10:00:00Z' } }),
      vue({ id: 'plus-tard', pipeline: { status: 'relance', nextActionAt: '2026-09-10T10:00:00', updatedAt: '2026-08-30T10:00:00Z' } }),
    ];
    const today = buildToday(rows, AUJOURDHUI);
    expect(today.followUps.items.map((r) => r.prospect.id)).toEqual(['due']);
  });

  it('met la relance la plus en retard en tete, parce qu on s y est engage le plus tot', () => {
    const rows = [
      vue({ id: 'hier', pipeline: { status: 'relance', nextActionAt: '2026-08-31T10:00:00', updatedAt: '2026-08-30T10:00:00Z' } }),
      vue({ id: 'la-semaine-derniere', pipeline: { status: 'relance', nextActionAt: '2026-08-25T10:00:00', updatedAt: '2026-08-25T10:00:00Z' } }),
    ];
    const today = buildToday(rows, AUJOURDHUI);
    expect(today.followUps.items.map((r) => r.prospect.id)).toEqual([
      'la-semaine-derniere',
      'hier',
    ]);
  });

  it('garde une relance sans date dans la file, et la place apres les echeances datees', () => {
    // Un engagement de rappel sans date reste un engagement. L'écarter parce
    // que `next_action_at` est vide le ferait disparaître de l'écran sans que
    // rien ne le signale.
    const rows = [
      vue({ id: 'sans-date', pipeline: { status: 'relance', nextActionAt: null, updatedAt: '2026-08-20T10:00:00Z' } }),
      vue({ id: 'datee', pipeline: { status: 'relance', nextActionAt: '2026-08-30T10:00:00', updatedAt: '2026-08-30T10:00:00Z' } }),
    ];
    const today = buildToday(rows, AUJOURDHUI);
    expect(today.followUps.items.map((r) => r.prospect.id)).toEqual(['datee', 'sans-date']);
  });

  it('exclut de la file un prospect a ne pas contacter, statut respecte immediatement', () => {
    const rows = [
      vue({ id: 'stop', score: scoreDe(95), pipeline: { status: 'ne_pas_contacter', nextActionAt: '2026-08-25T10:00:00', updatedAt: '2026-08-25T10:00:00Z' } }),
    ];
    const today = buildToday(rows, AUJOURDHUI);
    expect(today.followUps.items).toHaveLength(0);
  });

  it('annonce le nombre reel meme lorsqu il depasse ce qui tient dans la file', () => {
    // Sans quoi « Relances dues · 12 » cacherait les suivantes derriere une
    // liste tronquee, et l'ecran mentirait sur ce qui est du.
    const beaucoup = Array.from({ length: MAX_ROWS_PER_LIST + 4 }, (_, i) =>
      vue({
        id: `p${i}`,
        pipeline: { status: 'relance', nextActionAt: '2026-08-30T10:00:00', updatedAt: '2026-08-30T10:00:00Z' },
      }),
    );
    const today = buildToday(beaucoup, AUJOURDHUI);
    expect(today.followUps.items).toHaveLength(MAX_ROWS_PER_LIST);
    expect(today.followUps.totalCount).toBe(MAX_ROWS_PER_LIST + 4);
  });

  it('porte une raison sur chaque ligne de la file', () => {
    const rows = [
      vue({ id: 'r', pipeline: { status: 'relance', nextActionAt: '2026-08-30T10:00:00', updatedAt: '2026-08-30T10:00:00Z' } }),
      vue({ id: 's', score: scoreDe(60) }),
    ];
    const today = buildToday(rows, AUJOURDHUI);
    expect(today.followUps.items).toHaveLength(1);
    for (const ligne of today.followUps.items) {
      expect(ligne.reason.length).toBeGreaterThan(0);
    }
  });
});

describe('matchesQuery', () => {
  it('retrouve un prospect par sa denomination, insensible a la casse', () => {
    const p = vue({ id: 'a', denomination: 'AUBERT SERVICES' });
    expect(matchesQuery(p, 'aubert')).toBe(true);
    expect(matchesQuery(p, 'AUBERT')).toBe(true);
  });

  it('retrouve un prospect par son nom usuel quand la denomination legale ne correspond pas', () => {
    const p = vue({
      id: 'a',
      denomination: 'SARL DURAND ET FILS',
      denominationUsuelle: 'Plomberie Durand',
    });
    expect(matchesQuery(p, 'plomberie durand')).toBe(true);
  });

  it('ignore les accents, la denomination ne les normalisant pas elle meme', () => {
    const p = vue({ id: 'a', denomination: 'ÉLECTRICITÉ NANTAISE' });
    expect(matchesQuery(p, 'electricite')).toBe(true);
  });

  it('rejette un prospect qui ne correspond a rien', () => {
    const p = vue({ id: 'a', denomination: 'AUBERT SERVICES' });
    expect(matchesQuery(p, 'plombier')).toBe(false);
  });

  it('une recherche vide ou faite uniquement d espaces laisse passer tout le monde', () => {
    const p = vue({ id: 'a', denomination: 'AUBERT SERVICES' });
    expect(matchesQuery(p, '')).toBe(true);
    expect(matchesQuery(p, '   ')).toBe(true);
  });
});
