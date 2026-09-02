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

  it('n ouvre qu un onglet a la fois — c est tout l objet de la refonte', () => {
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    // L'onglet Fiche est actif au montage ; le contenu des autres n'est pas rendu.
    expect(screen.getByText('SIRET')).toBeDefined();
    expect(screen.queryByRole('heading', { name: /Historique/ })).toBeNull();
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
