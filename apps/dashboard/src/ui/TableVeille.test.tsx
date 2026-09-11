import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComptesVeille, PageVeille } from '../domain/veille.js';
import type { ProspectView } from '../domain/prospect.js';
import { TableVeille } from './TableVeille.js';
import { renderWithPreferences } from '../test-utils.js';

const MAINTENANT = new Date('2026-09-10T09:00:00.000');

function prospect(id: string, total: number): ProspectView {
  return {
    id, siret: '12345678900011', denomination: `Prospect ${id}`, denominationUsuelle: null,
    tradeSlug: 'plombier', address: '', postalCode: '44000', city: 'Nantes', dateCreation: null,
    effectifCode: null, isClosed: false, discoveredAt: '2026-09-01T00:00:00.000',
    score: { total, rulesetVersion: 'v3', computedAt: '2026-09-02T00:00:00.000', breakdown: [] },
    presence: null, enrichment: null, pipeline: null, site: null, messages: [],
  };
}

const COMPTES: ComptesVeille = {
  parOnglet: { a_contacter: 127, contacte: 1, relance: 1, interesse: 0, gagne: 0, perdu: 0, ne_pas_contacter: 0, toutes: 129 },
  sansScore: 10,
  sansSuivi: 137,
};

function page(surcharges: Partial<PageVeille> = {}): PageVeille {
  return {
    lignes: [prospect('a', 86), prospect('b', 79)],
    total: 127, page: 1, pages: 13, premier: 1, dernier: 2,
    ...surcharges,
  };
}

const props = {
  // Identiques par défaut : la plupart des tests ne portent pas sur la
  // recherche, et `comptes`/`comptesEnBase` doivent alors coïncider.
  comptes: COMPTES, comptesEnBase: COMPTES, ordre: 'score_desc' as const, totalEnBase: 139, selectedId: null,
  now: MAINTENANT, recherche: '', ongletPleinSansRecherche: 0,
  onChoisirOnglet: () => {}, onAllerPage: () => {}, onBasculerOrdre: () => {},
  onSelect: () => {}, onEffacerRecherche: () => {},
};

describe('TableVeille', () => {
  it('titre ses six colonnes, la dernière portant le sens de l onglet ouvert', () => {
    const { unmount } = renderWithPreferences(
      <TableVeille {...props} onglet="a_contacter" page={page()} />,
    );
    for (const titre of ['Score', 'Prospect', 'Présence web', 'Téléphone', 'Site', 'Suivi']) {
      expect(screen.getByText(titre)).toBeDefined();
    }
    unmount();

    renderWithPreferences(<TableVeille {...props} onglet="contacte" page={page()} />);
    expect(screen.getByText('Prochaine action')).toBeDefined();
    expect(screen.queryByText('Suivi')).toBeNull();
  });

  it('nomme les prospects jamais scorés, qui ne sont dans aucun onglet', () => {
    renderWithPreferences(<TableVeille {...props} onglet="a_contacter" page={page()} />);
    expect(screen.getByText('10 jamais scorés, non classables')).toBeDefined();
  });

  it('ne parle des jamais scorés que là où un classement de la base a lieu', () => {
    // Sur un onglet d'une ligne, cette phrase annonce une exclusion d'une
    // liste qui n'existe pas.
    renderWithPreferences(<TableVeille {...props} onglet="contacte" page={page({ total: 1, pages: 1, lignes: [prospect('a', 74)], dernier: 1 })} />);
    expect(screen.queryByText('10 jamais scorés, non classables')).toBeNull();
  });

  it('dit, sur « à contacter », combien de lignes sont classables et combien de prospects n ont aucun suivi', () => {
    // page().total = 127 et COMPTES.sansSuivi = 137 : deux nombres distincts,
    // pour qu'une inversion des deux paramètres se voie dans le texte rendu.
    renderWithPreferences(<TableVeille {...props} onglet="a_contacter" page={page()} />);
    expect(
      screen.getByText('127 classables, sur 137 sans aucune ligne de suivi en base'),
    ).toBeDefined();
  });

  it('dit, sur « toutes », combien de lignes sont classables et combien de prospects sont en base', () => {
    // COMPTES.parOnglet.toutes = 129 et props.totalEnBase = 139 : distincts.
    renderWithPreferences(<TableVeille {...props} onglet="toutes" page={page()} />);
    expect(screen.getByText('129 classables, sur 139 prospects en base')).toBeDefined();
  });

  it('dit le compte d un onglet de statut au pluriel', () => {
    renderWithPreferences(
      <TableVeille
        {...props}
        onglet="relance"
        page={page({ total: 5, pages: 1, lignes: [prospect('a', 60)], dernier: 1 })}
      />,
    );
    // 5 lignes dans l'onglet, 129 classables dans toute la base : distincts.
    expect(screen.getByText('5 prospects, sur 129 classables')).toBeDefined();
  });

  it('dit le compte d un onglet de statut au singulier, pour un unique prospect', () => {
    renderWithPreferences(
      <TableVeille
        {...props}
        onglet="contacte"
        page={page({ total: 1, pages: 1, lignes: [prospect('a', 60)], dernier: 1 })}
      />,
    );
    expect(screen.getByText('1 prospect, sur 129 classables')).toBeDefined();
  });

  it('nomme un onglet de statut à zéro, sans lui prêter de chiffre', () => {
    renderWithPreferences(
      <TableVeille
        {...props}
        onglet="gagne"
        page={page({ lignes: [], total: 0, pages: 1, premier: 0, dernier: 0 })}
      />,
    );
    expect(screen.getByText('aucun prospect à ce statut')).toBeDefined();
  });

  it('nomme un onglet vide, et n affiche alors ni colonnes ni pagination', () => {
    renderWithPreferences(
      <TableVeille {...props} onglet="gagne" page={page({ lignes: [], total: 0, pages: 1, premier: 0, dernier: 0 })} />,
    );
    expect(screen.getByText('Aucune vente conclue pour l’instant')).toBeDefined();
    expect(screen.queryByText('Score')).toBeNull();
    expect(screen.queryByText('10 par page')).toBeNull();
  });

  it('nomme l onglet « à contacter » vide sans lui offrir de sortie, puisqu on y est déjà', () => {
    // Les autres onglets vides proposent « Voir les N à contacter » : une
    // sortie VERS cet onglet-là. Ici, l'absence n'a nulle part où renvoyer —
    // c'est la seule branche du composant qui nomme le vide sans bouton.
    renderWithPreferences(
      <TableVeille
        {...props}
        onglet="a_contacter"
        page={page({ lignes: [], total: 0, pages: 1, premier: 0, dernier: 0 })}
      />,
    );
    expect(screen.getByText('Aucun prospect à contacter')).toBeDefined();
    expect(
      screen.getByText('Tous les prospects scorés portent une décision. La collecte en apportera d’autres.'),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: /^Voir les/ })).toBeNull();
  });

  it('offre depuis un onglet vide une sortie vers l onglet plein', async () => {
    const onChoisirOnglet = vi.fn();
    renderWithPreferences(
      <TableVeille {...props} onChoisirOnglet={onChoisirOnglet} onglet="gagne" page={page({ lignes: [], total: 0, pages: 1, premier: 0, dernier: 0 })} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 127 à contacter' }));
    expect(onChoisirOnglet).toHaveBeenCalledWith('a_contacter');
  });

  it('distingue un onglet vidé par la recherche d un onglet vide de naissance', async () => {
    // Deux absences de natures différentes : « personne n'est jamais passé
    // ici » et « votre recherche ne rend rien ». Les confondre ferait annoncer
    // « Aucune vente conclue » à quelqu'un qui a tapé « couvreur ».
    const onEffacerRecherche = vi.fn();
    renderWithPreferences(
      <TableVeille
        {...props}
        onglet="a_contacter"
        recherche="couvreur"
        ongletPleinSansRecherche={127}
        onEffacerRecherche={onEffacerRecherche}
        page={page({ lignes: [], total: 0, pages: 1, premier: 0, dernier: 0 })}
      />,
    );
    expect(screen.getByText('Aucune ligne ne correspond à votre recherche')).toBeDefined();
    expect(
      screen.getByText('127 prospects sont bien dans cet onglet — aucun ne porte « couvreur ».'),
    ).toBeDefined();
    expect(screen.queryByText('Aucun prospect à contacter')).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(onEffacerRecherche).toHaveBeenCalled();
  });

  it('garde le vide de l onglet quand la recherche n y est pour rien', () => {
    // L'onglet était déjà vide sans elle : la recherche n'explique pas ce vide.
    renderWithPreferences(
      <TableVeille
        {...props}
        onglet="gagne"
        recherche="couvreur"
        ongletPleinSansRecherche={0}
        page={page({ lignes: [], total: 0, pages: 1, premier: 0, dernier: 0 })}
      />,
    );
    expect(screen.getByText('Aucune vente conclue pour l’instant')).toBeDefined();
  });

  it('puise les nombres qui disent « en base » dans comptesEnBase, jamais dans comptes filtré par la recherche', () => {
    // `comptes` simule ici une recherche en cours (des nombres bien plus
    // petits que la base réelle) ; `comptesEnBase` simule la base entière.
    // Les trois usages qui parlent explicitement de la base — le
    // dénominateur de « à contacter », les deux nombres de « toutes », et le
    // badge des jamais scorés — doivent tous lire `comptesEnBase` (relevé de
    // revue, constat 2).
    const comptesFiltres: ComptesVeille = {
      parOnglet: { a_contacter: 1, contacte: 0, relance: 0, interesse: 0, gagne: 0, perdu: 0, ne_pas_contacter: 0, toutes: 1 },
      sansScore: 0,
      sansSuivi: 1,
    };
    const { unmount } = renderWithPreferences(
      <TableVeille {...props} comptes={comptesFiltres} comptesEnBase={COMPTES} onglet="a_contacter" page={page({ total: 1 })} />,
    );
    expect(screen.getByText('1 classables, sur 137 sans aucune ligne de suivi en base')).toBeDefined();
    expect(screen.getByText('10 jamais scorés, non classables')).toBeDefined();
    unmount();

    renderWithPreferences(
      <TableVeille {...props} comptes={comptesFiltres} comptesEnBase={COMPTES} onglet="toutes" page={page({ total: 1 })} />,
    );
    expect(screen.getByText('129 classables, sur 139 prospects en base')).toBeDefined();
  });

  it('bascule l ordre du classement, et le dit', async () => {
    const onBasculerOrdre = vi.fn();
    renderWithPreferences(
      <TableVeille {...props} onBasculerOrdre={onBasculerOrdre} onglet="a_contacter" page={page()} />,
    );
    const tri = screen.getByRole('button', { name: 'Tri : score décroissant' });
    await userEvent.click(tri);
    expect(onBasculerOrdre).toHaveBeenCalled();
  });
});
