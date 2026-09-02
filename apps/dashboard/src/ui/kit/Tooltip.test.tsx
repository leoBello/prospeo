import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../../test-utils.js';
import { Tooltip } from './Tooltip.js';

/*
 * Base UI n'ouvre pas l'infobulle au survol avant 600 ms — c'est le délai qui
 * empêche le clignotement quand la souris ne fait que traverser. L'attente par
 * défaut de `findBy*` est de 1000 ms : elle suffit tout juste, ce qui est une
 * mauvaise raison de passer. On la nomme donc.
 */
const ATTENTE_SURVOL = { timeout: 3000 };

describe('Tooltip', () => {
  it('garde le contenu hors du DOM tant que rien ne le demande', () => {
    renderWithPreferences(
      <Tooltip contenu="Google ne publie plus le nombre d'avis.">
        <button type="button">non publié</button>
      </Tooltip>,
    );
    expect(screen.queryByText(/ne publie plus/)).toBeNull();
  });

  it('revele le contenu au survol', async () => {
    const user = userEvent.setup();
    renderWithPreferences(
      <Tooltip contenu="Google ne publie plus le nombre d'avis.">
        <button type="button">non publié</button>
      </Tooltip>,
    );
    await user.hover(screen.getByRole('button', { name: 'non publié' }));
    expect(await screen.findByText(/ne publie plus/, {}, ATTENTE_SURVOL)).toBeDefined();
  });

  it('revele le contenu au clavier seul, sans souris', async () => {
    // Une infobulle qui ne s'ouvre qu'au survol est une infobulle que les
    // personnes naviguant au clavier ne liront jamais. Aucun événement de
    // pointeur n'est émis ici : `tab()` ne déplace que le focus.
    const user = userEvent.setup();
    renderWithPreferences(
      <Tooltip contenu="Le gabarit du metier l'emporte sur le gabarit actif.">
        <button type="button">?</button>
      </Tooltip>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: '?' })).toBe(document.activeElement);
    expect(await screen.findByText(/l'emporte/)).toBeDefined();
  });
});
