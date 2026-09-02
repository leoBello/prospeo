import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView } from '../domain/prospect.js';
import { ProspectPanel } from './ProspectPanel.js';

const prospect = (patch: Partial<ProspectView> = {}): ProspectView => ({
  id: 'p1',
  siret: '81245678900023',
  denomination: 'PLOMBERIE GUERIN ET FILS',
  denominationUsuelle: 'Plomberie Guérin & Fils',
  tradeSlug: 'plombier',
  address: '14 rue des Olivettes',
  postalCode: '44000',
  city: 'Nantes',
  dateCreation: '2019-03-12',
  effectifCode: '11',
  isClosed: false,
  discoveredAt: '2026-08-30T00:00:00Z',
  score: null,
  presence: null,
  enrichment: null,
  pipeline: { status: 'relance', nextActionAt: '2026-09-02', updatedAt: '2026-09-01T00:00:00Z' },
  site: null,
  messages: [],
  ...patch,
});

describe('ProspectPanel', () => {
  it('affiche le nom d usage plutot que la denomination legale', () => {
    // « PLOMBERIE GUERIN ET FILS » est ce que dit l'INSEE ; l'enseigne est ce
    // que dira l'interlocuteur au telephone.
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Plomberie Guérin & Fils' })).toBeDefined();
  });

  it('n ouvre qu un onglet a la fois — c est tout l objet de la refonte', async () => {
    // La preuve doit porter sur un texte propre au contenu de chaque onglet,
    // pas sur un role="heading" que l'onglet visé ne rend pas (Historique n'en
    // a pas) ni sur un texte présent de toute façon (SIRET) : ces deux formes
    // passaient déjà avec les quatre panneaux montés en permanence — le bug
    // exact que ce test doit détecter.
    const user = userEvent.setup();
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );

    // Avant tout clic, seul l'onglet Fiche (actif par défaut) est monté : le
    // contenu des trois autres ne doit pas exister dans le DOM.
    expect(screen.queryByRole('heading', { name: 'Site généré' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Messages de vente' })).toBeNull();
    expect(screen.queryByText(/Journal détaillé des étapes/)).toBeNull();

    await user.click(screen.getByRole('tab', { name: /Site/ }));
    expect(screen.getByRole('heading', { name: 'Site généré' })).toBeDefined();

    await user.click(screen.getByRole('tab', { name: /Messages/ }));
    expect(screen.getByRole('heading', { name: 'Messages de vente' })).toBeDefined();

    await user.click(screen.getByRole('tab', { name: /Historique/ }));
    expect(screen.getByText(/Journal détaillé des étapes/)).toBeDefined();
  });

  it('bascule d onglet au clic', async () => {
    const user = userEvent.setup();
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    await user.click(screen.getByRole('tab', { name: /Site/ }));
    expect(await screen.findByText(/étage « generate »/)).toBeDefined();
  });

  it('bascule d onglet aux fleches, sans souris', async () => {
    // La navigation clavier d'un jeu d'onglets est une norme ARIA, pas un
    // confort : c'est Base UI qui la fournit, et ce test verifie qu'elle est
    // bien cablee.
    const user = userEvent.setup();
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    await user.click(screen.getByRole('tab', { name: /Fiche/ }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Site/ })).toHaveProperty('tabIndex', 0);
  });

  it('rend une invite quand aucun prospect n est choisi', () => {
    renderWithPreferences(
      <ProspectPanel prospect={null} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    expect(screen.getByText(/Choisir un prospect/)).toBeDefined();
  });
});
