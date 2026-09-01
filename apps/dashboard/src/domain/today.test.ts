import { describe, expect, it } from 'vitest';
import type { ProspectView } from './prospect.js';
import {
  MAX_ROWS_PER_LIST,
  buildToday,
  computeKpis,
  followUpReason,
  highlightLines,
  qualificationGaps,
  responseRate,
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

describe('qualificationGaps', () => {
  it('enumere les etapes manquantes dans l ordre du pipeline', () => {
    expect(qualificationGaps(vue({ id: 'a' }))).toEqual([
      'today.reason.missing.enrichment',
      'today.reason.missing.presence',
      'today.reason.missing.score',
    ]);
  });

  it('ne signale que ce qui manque reellement', () => {
    const partiel = vue({
      id: 'b',
      enrichment: {
        status: 'not_found',
        phoneE164: null,
        phoneKind: null,
        rating: null,
        reviewCount: null,
        declaredUrl: null,
        matchedName: null,
        matchConfidence: null,
        enrichedAt: '2026-09-01T00:00:00Z',
      },
    });
    expect(qualificationGaps(partiel)).toEqual([
      'today.reason.missing.presence',
      'today.reason.missing.score',
    ]);
  });

  it('ne rend rien pour un prospect entierement qualifie', () => {
    const complet = vue({
      id: 'c',
      enrichment: {
        status: 'ok',
        phoneE164: null,
        phoneKind: null,
        rating: null,
        reviewCount: null,
        declaredUrl: null,
        matchedName: null,
        matchConfidence: null,
        enrichedAt: '2026-09-01T00:00:00Z',
      },
      presence: {
        category: 'none',
        finalUrl: null,
        httpStatus: null,
        domainAvailable: null,
        probedAt: '2026-09-01T00:00:00Z',
      },
      score: scoreDe(45),
    });
    expect(qualificationGaps(complet)).toEqual([]);
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

describe('responseRate', () => {
  it('refuse de rendre zero pour cent quand personne n a ete contacte', () => {
    // 0 / 0 n'est pas 0 %. Afficher « 0 % » ferait lire un échec commercial là
    // où il n'y a tout simplement pas encore de prospection.
    const mesure = responseRate({ contacted: 0, replied: 0 });
    expect(mesure.known).toBe(false);
  });

  it('rend le taux quand le denominateur existe', () => {
    const mesure = responseRate({ contacted: 20, replied: 5 });
    expect(mesure).toEqual({ known: true, value: 0.25 });
  });

  it('reste indisponible quand le nombre de reponses n est pas mesurable', () => {
    // `interaction` ne distingue pas un échange reçu d'un échange émis : le
    // numérateur n'existe pas dans le schéma actuel.
    expect(responseRate({ contacted: 20, replied: null }).known).toBe(false);
  });
});

describe('computeKpis', () => {
  const pipeline = (status: NonNullable<ProspectView['pipeline']>['status']) => ({
    status,
    nextActionAt: null,
    updatedAt: '2026-08-30T10:00:00Z',
  });

  it('compte en base tous les prospects, y compris ceux qui n ont aucun satellite', () => {
    const kpis = computeKpis([vue({ id: 'a' }), vue({ id: 'b', score: scoreDe(50) })]);
    expect(kpis.inBase).toBe(2);
  });

  it('ne compte pas comme contacte un prospect seulement marque a contacter', () => {
    // Marquer n'est pas contacter. Le confondre gonflerait le seul indicateur
    // qui mesure l'activite reelle.
    const kpis = computeKpis([
      vue({ id: 'marque', pipeline: pipeline('a_contacter') }),
      vue({ id: 'appele', pipeline: pipeline('contacte') }),
    ]);
    expect(kpis.contacted).toBe(1);
  });

  it('rend le taux de reponse indisponible tant que la table de suivi est vide', () => {
    const kpis = computeKpis([vue({ id: 'a' })]);
    expect(kpis.contacted).toBe(0);
    expect(kpis.interested).toBe(0);
    expect(kpis.responseRate.known).toBe(false);
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

  it('ne range pas un prospect sans score parmi les prospects a fort score', () => {
    // 114 prospects sur 139 sont dans ce cas : les faire tomber à zéro les
    // placerait en bas d'une liste où ils n'ont rien à faire.
    const today = buildToday([...enAttente, ...scores], AUJOURDHUI);
    expect(today.newHighScore.items.map((r) => r.prospect.id)).not.toContain('x1');
    expect(today.awaiting.items.map((r) => r.prospect.id)).toEqual(['x1', 'x2']);
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
    // Sans quoi « En attente · 10 » cacherait 104 prospects derrière une liste
    // tronquée, et l'écran mentirait sur l'état de la base.
    const beaucoup = Array.from({ length: MAX_ROWS_PER_LIST + 4 }, (_, i) => vue({ id: `p${i}` }));
    const today = buildToday(beaucoup, AUJOURDHUI);
    expect(today.awaiting.items).toHaveLength(MAX_ROWS_PER_LIST);
    expect(today.awaiting.totalCount).toBe(MAX_ROWS_PER_LIST + 4);
  });

  it('porte une raison sur chaque ligne des trois listes', () => {
    const rows = [
      vue({ id: 'r', pipeline: { status: 'relance', nextActionAt: '2026-08-30T10:00:00', updatedAt: '2026-08-30T10:00:00Z' } }),
      vue({ id: 's', score: scoreDe(60) }),
      vue({ id: 'a' }),
    ];
    const today = buildToday(rows, AUJOURDHUI);
    for (const liste of [today.followUps, today.newHighScore, today.awaiting]) {
      for (const ligne of liste.items) {
        expect(ligne.reason.length).toBeGreaterThan(0);
      }
    }
  });
});
