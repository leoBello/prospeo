import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView } from '../domain/prospect.js';
import { TodayScreen } from './TodayScreen.js';

const AUJOURDHUI = new Date('2026-09-01T09:00:00');

function vue(id: string, patch: Partial<ProspectView> = {}): ProspectView {
  return {
    id,
    siret: `1111111110${id}`,
    denomination: `ENTREPRISE ${id}`,
    denominationUsuelle: null,
    tradeSlug: 'plombier',
    address: '5 RUE LE NOTRE 44000 NANTES',
    postalCode: '44000',
    city: 'NANTES',
    dateCreation: '2012-12-15',
    effectifCode: '02',
    isClosed: false,
    discoveredAt: '2026-09-01T01:38:07Z',
    score: null,
    presence: null,
    enrichment: null,
    pipeline: null,
    ...patch,
  };
}

const score = (total: number, version = 'v2') => ({
  total,
  rulesetVersion: version,
  computedAt: '2026-09-01T00:00:00Z',
  breakdown: [
    { code: 'presence_none', label: 'Aucune présence web', points: 35, group: 'presence' as const },
    { code: 'phone_none', label: 'Aucun téléphone', points: -25, group: 'joignabilite' as const },
  ],
});

function rendre(prospects: ProspectView[]) {
  return renderWithPreferences(
    <TodayScreen
      prospects={prospects}
      currentRulesetVersion="v2"
      now={AUJOURDHUI}
      onSignOut={vi.fn()}
    />,
  );
}

describe('TodayScreen', () => {
  it('montre les prospects non qualifies au lieu de les faire disparaitre', () => {
    // Sur la base réelle, 114 prospects sur 139 n'ont ni enrichissement, ni
    // présence web, ni score. Un écran bâti sur les deux seules listes du
    // §9.2 serait vide à 80 % sans jamais dire pourquoi.
    rendre([vue('a'), vue('b', { score: score(30) })]);
    expect(screen.getByText('En attente de qualification')).toBeDefined();
    expect(screen.getByText(/pas encore enrichi/)).toBeDefined();
  });

  it('dit pourquoi la file de relances est vide, plutot que de rester muette', () => {
    rendre([vue('a')]);
    expect(screen.getByText(/la table de suivi ne contient encore aucune ligne/)).toBeDefined();
  });

  it('affiche le taux de reponse comme indisponible et non comme zero pour cent', () => {
    rendre([vue('a')]);
    expect(screen.getByText('sans objet')).toBeDefined();
    expect(screen.queryByText('0 %')).toBeNull();
  });

  it('ouvre le panneau a la premiere fleche et y parcourt les prospects', async () => {
    const user = userEvent.setup();
    rendre([vue('haut', { score: score(90) }), vue('bas', { score: score(50) })]);

    expect(screen.queryByRole('complementary')).toBeNull();

    await user.keyboard('{ArrowDown}');
    const panneau = screen.getByRole('complementary');
    expect(within(panneau).getByRole('heading', { level: 2 }).textContent).toBe('ENTREPRISE haut');

    await user.keyboard('{ArrowDown}');
    // Le panneau n'a pas été quitté : c'est tout l'intérêt du patron (§9.1).
    expect(within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }).textContent)
      .toBe('ENTREPRISE bas');

    await user.keyboard('{ArrowUp}');
    expect(within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }).textContent)
      .toBe('ENTREPRISE haut');
  });

  it('ferme le panneau sur Echap sans faire disparaitre la liste', async () => {
    const user = userEvent.setup();
    rendre([vue('a', { score: score(90) })]);

    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('complementary')).toBeDefined();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('complementary')).toBeNull();
    // La liste n'a jamais disparu.
    expect(screen.getByText('ENTREPRISE a')).toBeDefined();
  });

  it('traverse la frontiere entre deux listes sans reprendre la souris', async () => {
    const user = userEvent.setup();
    rendre([vue('note', { score: score(90) }), vue('attente')]);

    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(within(screen.getByRole('complementary')).getByRole('heading', { level: 2 }).textContent)
      .toBe('ENTREPRISE attente');
  });

  it('situe le prospect dans la file, pour qu on sache ou l on en est', async () => {
    const user = userEvent.setup();
    rendre([vue('a', { score: score(90) }), vue('b', { score: score(50) })]);

    await user.keyboard('{ArrowDown}');
    expect(within(screen.getByRole('complementary')).getByText('1 sur 2')).toBeDefined();
  });

  it('signale dans le panneau un score calcule avec un bareme perime', async () => {
    const user = userEvent.setup();
    rendre([vue('a', { score: score(30, 'v1') })]);

    await user.keyboard('{ArrowDown}');
    expect(
      within(screen.getByRole('complementary')).getByText(/version antérieure du barème/),
    ).toBeDefined();
  });
});
