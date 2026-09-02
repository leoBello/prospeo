import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ATTENTE_SURVOL, renderWithPreferences } from '../../test-utils.js';
import { Bientot } from './Bientot.js';

describe('Bientot', () => {
  it('affiche le contenu et le marque comme a venir', () => {
    renderWithPreferences(
      <Bientot raison="Aucune table d'evenements de deploiement n'existe encore.">
        <span>Journal de construction</span>
      </Bientot>,
    );
    expect(screen.getByText('Journal de construction')).toBeDefined();
    expect(screen.getByText('Bientôt')).toBeDefined();
  });

  it('dit la raison, et non un « indisponible » sans motif', async () => {
    // Une fonctionnalite grisee sans explication se lit comme une panne.
    const user = userEvent.setup();
    renderWithPreferences(
      <Bientot raison="Aucune table d'evenements de deploiement n'existe encore.">
        <span>Journal de construction</span>
      </Bientot>,
    );
    await user.hover(screen.getByText('Bientôt'));
    // Meme delai de 600 ms que dans `Tooltip.test.tsx`, et meme raison de ne
    // pas s'en remettre au budget par defaut de 1000 ms.
    expect(await screen.findByText(/table d'evenements/, {}, ATTENTE_SURVOL)).toBeDefined();
  });

  it('retire le contenu du parcours clavier et le signale aux lecteurs d ecran', async () => {
    // Laisser tabuler vers un controle inerte est une impasse : on croit
    // l'avoir active, rien ne se passe, et rien ne dit pourquoi.
    const { container } = renderWithPreferences(
      <Bientot raison="Pas encore de source.">
        <button type="button">Redéployer</button>
      </Bientot>,
    );
    const zone = container.querySelector('[aria-disabled="true"]');
    expect(zone).not.toBeNull();
    expect(zone?.getAttribute('inert')).not.toBeNull();
  });
});
