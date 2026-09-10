import { describe, expect, it } from 'vitest';
import type { ProspectView } from './prospect.js';
import type { ScoreView } from './prospect.js';
import { LIGNES_PAR_PAGE, ONGLETS, comptesVeille, ongletDe, pageVeille } from './veille.js';

/** Un prospect réduit à ce que la veille lit. Le reste n'entre dans aucune décision. */
function prospect(surcharges: Partial<ProspectView> = {}): ProspectView {
  return {
    id: 'p1',
    siret: '12345678900011',
    denomination: 'Aquatech Nantes',
    denominationUsuelle: null,
    tradeSlug: 'plombier',
    address: '1 rue des Olivettes',
    postalCode: '44000',
    city: 'Nantes',
    dateCreation: null,
    effectifCode: null,
    isClosed: false,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    score: null,
    presence: null,
    enrichment: null,
    pipeline: null,
    site: null,
    messages: [],
    ...surcharges,
  };
}

describe('ONGLETS', () => {
  it('porte les sept statuts du pipeline, puis « toutes » — jamais un huitième statut inventé', () => {
    expect(ONGLETS).toEqual([
      'a_contacter',
      'contacte',
      'relance',
      'interesse',
      'gagne',
      'perdu',
      'ne_pas_contacter',
      'toutes',
    ]);
  });
});

describe('ongletDe', () => {
  it('range un prospect sans aucune ligne de suivi dans « à contacter » (décision 1A)', () => {
    // 137 prospects sur 139 sont dans ce cas au 2 septembre 2026. Les laisser
    // hors de tout onglet retirerait 98 % de la base de l'écran.
    expect(ongletDe(prospect({ pipeline: null }))).toBe('a_contacter');
  });

  it('range un prospect au statut « a_contacter » dans le même onglet, sans les confondre pour autant', () => {
    const pose = prospect({
      pipeline: { status: 'a_contacter', nextActionAt: null, updatedAt: '2026-09-02T00:00:00.000Z' },
    });
    expect(ongletDe(pose)).toBe('a_contacter');
    // La distinction survit : elle est portée par `pipeline`, que la rangée lit.
    expect(pose.pipeline).not.toBeNull();
  });

  it('rend le statut de la ligne de suivi quand elle existe', () => {
    for (const statut of ['contacte', 'relance', 'interesse', 'gagne', 'perdu', 'ne_pas_contacter'] as const) {
      expect(
        ongletDe(prospect({ pipeline: { status: statut, nextActionAt: null, updatedAt: '2026-09-02T00:00:00.000Z' } })),
      ).toBe(statut);
    }
  });
});

/** Un score réduit à son total : la décomposition n'entre dans aucune décision de ce module. */
function score(total: number): ScoreView {
  return { total, rulesetVersion: 'v3', computedAt: '2026-09-02T00:00:00.000Z', breakdown: [] };
}

describe('comptesVeille', () => {
  it('compte chaque onglet, « toutes » valant le total des prospects classables', () => {
    const comptes = comptesVeille([
      prospect({ id: 'a', score: score(80) }),
      prospect({ id: 'b', score: score(70) }),
      prospect({
        id: 'c',
        score: score(60),
        pipeline: { status: 'contacte', nextActionAt: null, updatedAt: '2026-09-02T00:00:00.000Z' },
      }),
    ]);
    expect(comptes.parOnglet.a_contacter).toBe(2);
    expect(comptes.parOnglet.contacte).toBe(1);
    expect(comptes.parOnglet.toutes).toBe(3);
  });

  it('laisse à zéro les onglets sans prospect, plutôt que de les omettre', () => {
    // Un onglet à zéro est une étape du parcours, pas une absence de données :
    // il reste dans la barre, et son compte doit donc exister.
    const comptes = comptesVeille([prospect({ id: 'a', score: score(80) })]);
    for (const onglet of ONGLETS) {
      expect(comptes.parOnglet[onglet], onglet).toBeTypeOf('number');
    }
    expect(comptes.parOnglet.gagne).toBe(0);
  });

  it('compte à part les prospects sans aucune ligne de suivi, scorés ou non', () => {
    // La ligne de compte de l'onglet « À contacter » dit « 127 classables, sur
    // 137 sans aucune ligne de suivi en base ». Le second nombre ne se déduit
    // d'aucun compte d'onglet : les non-scorés n'y figurent pas.
    const comptes = comptesVeille([
      prospect({ id: 'a', score: score(80) }),
      prospect({ id: 'b', score: null }),
      prospect({
        id: 'c',
        score: score(60),
        pipeline: { status: 'contacte', nextActionAt: null, updatedAt: '2026-09-02T00:00:00.000Z' },
      }),
    ]);
    expect(comptes.sansSuivi).toBe(2);
  });

  it('exclut du classement les prospects jamais scorés, et les compte à part', () => {
    // Un prospect sans score n'est pas un prospect à zéro : il ne peut pas
    // être classé, et le taire le ferait disparaître sans explication.
    const comptes = comptesVeille([
      prospect({ id: 'a', score: score(80) }),
      prospect({ id: 'b', score: null }),
      prospect({ id: 'c', score: null }),
    ]);
    expect(comptes.parOnglet.a_contacter).toBe(1);
    expect(comptes.parOnglet.toutes).toBe(1);
    expect(comptes.sansScore).toBe(2);
  });
});

describe('pageVeille', () => {
  const base = Array.from({ length: 23 }, (_, i) =>
    prospect({ id: `p${i}`, denomination: `Prospect ${i}`, score: score(100 - i) }),
  );

  it('rend dix lignes par page, quelle que soit la hauteur de la fenêtre (décision 3-1)', () => {
    expect(LIGNES_PAR_PAGE).toBe(10);
    expect(pageVeille(base, 'a_contacter', 'score_desc', 1).lignes).toHaveLength(10);
  });

  it('classe par score décroissant par défaut', () => {
    const page = pageVeille(base, 'a_contacter', 'score_desc', 1);
    expect(page.lignes[0]?.score?.total).toBe(100);
    expect(page.lignes[9]?.score?.total).toBe(91);
  });

  it('inverse le classement à la demande, sans changer la taille de page', () => {
    const page = pageVeille(base, 'a_contacter', 'score_asc', 1);
    expect(page.lignes[0]?.score?.total).toBe(78);
    expect(page.lignes).toHaveLength(10);
  });

  it('annonce l étendue affichée et le nombre de pages, bornes comprises', () => {
    const derniere = pageVeille(base, 'a_contacter', 'score_desc', 3);
    expect(derniere.total).toBe(23);
    expect(derniere.pages).toBe(3);
    expect(derniere.premier).toBe(21);
    expect(derniere.dernier).toBe(23);
    expect(derniere.lignes).toHaveLength(3);
  });

  it('ramène une page hors bornes à la dernière page, plutôt que de rendre du vide', () => {
    // Changer d'onglet depuis la page 3 d'un onglet plein vers un onglet qui
    // n'a qu'une page rendrait sinon une table vide sur un onglet plein.
    const page = pageVeille(base, 'a_contacter', 'score_desc', 99);
    expect(page.page).toBe(3);
    expect(page.lignes).toHaveLength(3);
  });

  it('rend une page vide, et non une page fantôme, quand l onglet n a personne', () => {
    const page = pageVeille(base, 'gagne', 'score_desc', 1);
    expect(page.lignes).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.pages).toBe(1);
    expect(page.premier).toBe(0);
    expect(page.dernier).toBe(0);
  });

  it('départage deux scores égaux par la dénomination, pour que l ordre ne bouge pas d un rendu à l autre', () => {
    // Sans départage, `sort` n'est stable qu'en apparence : deux lignes de même
    // score peuvent changer de place entre deux pages et l'une serait vue deux
    // fois, l'autre jamais.
    const egaux = [
      prospect({ id: 'z', denomination: 'Zed Plomberie', score: score(50) }),
      prospect({ id: 'a', denomination: 'Aquatech Nantes', score: score(50) }),
    ];
    const page = pageVeille(egaux, 'a_contacter', 'score_desc', 1);
    expect(page.lignes.map((p) => p.id)).toEqual(['a', 'z']);
  });
});
