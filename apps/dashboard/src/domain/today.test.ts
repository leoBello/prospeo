import { describe, expect, it } from 'vitest';
import type { ProspectView } from './prospect.js';
import {
  MAX_ROWS_PER_LIST,
  buildToday,
  followUpReason,
  highlightLines,
  matchesQuery,
} from './today.js';

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

describe('highlightLines', () => {
  it('ouvre toujours par la presence web, qui est le motif de qualification', () => {
    const lignes = highlightLines(
      [
        { code: 'reputation', label: '4,6 ★', points: 25, group: 'vitalite' },
        { code: 'presence_social_only', label: 'Page sociale', points: 45, group: 'presence' },
        { code: 'phone_mobile', label: 'Mobile trouvé', points: 20, group: 'joignabilite' },
      ],
      3,
    );
    expect(lignes[0]?.code).toBe('presence_social_only');
  });

  it('ecarte les lignes qui ne rapportent rien, une raison ne se justifiant pas par un manque', () => {
    const lignes = highlightLines(
      [
        { code: 'presence_none', label: 'Aucune présence', points: 35, group: 'presence' },
        { code: 'phone_none', label: 'Aucun téléphone', points: -25, group: 'joignabilite' },
      ],
      3,
    );
    expect(lignes.map((l) => l.code)).toEqual(['presence_none']);
  });

  it('garde les lignes les plus lourdes en premier, dans la limite demandee', () => {
    const lignes = highlightLines(
      [
        { code: 'presence_none', label: 'p', points: 35, group: 'presence' },
        { code: 'age', label: 'a', points: 10, group: 'vitalite' },
        { code: 'reputation', label: 'r', points: 25, group: 'vitalite' },
      ],
      2,
    );
    expect(lignes.map((l) => l.code)).toEqual(['presence_none', 'reputation']);
  });
});

describe('buildToday', () => {
  const enAttente = [vue({ id: 'x1' }), vue({ id: 'x2' })];
  const scores = [
    vue({ id: 's1', score: scoreDe(70) }),
    vue({ id: 's2', score: scoreDe(90) }),
  ];

  it('classe les nouveaux prospects par score decroissant', () => {
    const today = buildToday([...enAttente, ...scores], AUJOURDHUI);
    expect(today.newHighScore.items.map((r) => r.prospect.id)).toEqual(['s2', 's1']);
  });

  it('n inscrit un prospect sans score dans aucune file de travail', () => {
    // 10 prospects sur 139 sont dans ce cas (releve du 2 septembre 2026,
    // apres qu'une campagne de scoring a couvert la majorite de la base).
    // Les faire tomber a zero les
    // placerait en bas d'une liste ou ils n'ont rien a faire ; leur donner une
    // file a eux couterait douze arrets aux fleches pour des lignes sur
    // lesquelles aucune action n'est possible. Leur nombre n'est plus compte
    // nulle part sur cet ecran (voir le rapport de la tache 8).
    const today = buildToday([...enAttente, ...scores], AUJOURDHUI);
    const affiches = [...today.followUps.items, ...today.newHighScore.items].map(
      (r) => r.prospect.id,
    );
    expect(affiches).toEqual(['s2', 's1']);
  });

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
    expect(today.newHighScore.items).toHaveLength(0);
  });

  it('ne propose comme nouveaux que les prospects jamais engages dans le pipeline', () => {
    const rows = [
      vue({ id: 'deja', score: scoreDe(80), pipeline: { status: 'contacte', nextActionAt: null, updatedAt: '2026-08-25T10:00:00Z' } }),
      vue({ id: 'neuf', score: scoreDe(60) }),
    ];
    const today = buildToday(rows, AUJOURDHUI);
    expect(today.newHighScore.items.map((r) => r.prospect.id)).toEqual(['neuf']);
  });

  it('annonce le nombre reel meme lorsqu il depasse ce qui tient dans la liste', () => {
    // Sans quoi « Nouveaux prospects · 12 » cacherait les suivants derriere une
    // liste tronquee, et l'ecran mentirait sur l'etat de la base.
    const beaucoup = Array.from({ length: MAX_ROWS_PER_LIST + 4 }, (_, i) =>
      vue({ id: `p${i}`, score: scoreDe(90 - i) }),
    );
    const today = buildToday(beaucoup, AUJOURDHUI);
    expect(today.newHighScore.items).toHaveLength(MAX_ROWS_PER_LIST);
    expect(today.newHighScore.totalCount).toBe(MAX_ROWS_PER_LIST + 4);
  });

  it('porte une raison sur chaque ligne des deux listes', () => {
    const rows = [
      vue({ id: 'r', pipeline: { status: 'relance', nextActionAt: '2026-08-30T10:00:00', updatedAt: '2026-08-30T10:00:00Z' } }),
      vue({ id: 's', score: scoreDe(60) }),
    ];
    const today = buildToday(rows, AUJOURDHUI);
    for (const liste of [today.followUps, today.newHighScore]) {
      for (const ligne of liste.items) {
        expect(ligne.reason.length).toBeGreaterThan(0);
      }
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
