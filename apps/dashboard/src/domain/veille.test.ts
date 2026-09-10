import { describe, expect, it } from 'vitest';
import type { ProspectView } from './prospect.js';
import { ONGLETS, ongletDe } from './veille.js';

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
