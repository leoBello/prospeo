import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import { BarreHaut } from './BarreHaut.js';

describe('BarreHaut', () => {
  beforeEach(() => {
    // Le thème et la langue persistent en `localStorage` (`preferences.tsx`) :
    // sans ce nettoyage, un test qui bascule la préférence ferait démarrer le
    // suivant sur l'état laissé par le précédent, dans l'ordre où vitest
    // choisit de les exécuter. `try/catch` : sous jsdom, sans URL http(s)
    // configurée, `window.localStorage` est `undefined` plutôt que vide —
    // exactement le cas que `preferences.tsx` enveloppe déjà de son côté.
    try {
      window.localStorage.clear();
    } catch {
      // Rien à nettoyer : `preferences.tsx` retombe alors toujours sur ses
      // valeurs par défaut, ce qui revient au même pour ce test.
    }
  });

  it('affiche le nom de l application', () => {
    renderWithPreferences(<BarreHaut onSignOut={vi.fn()} />);
    expect(screen.getByText('Prospeo')).toBeDefined();
  });

  it('replie les preferences derriere un bouton de compte : rien n en est visible avant ouverture', () => {
    renderWithPreferences(<BarreHaut onSignOut={vi.fn()} />);
    // Base UI ne monte le popup qu'une fois ouvert : ces commandes ne sont
    // pas seulement masquées, elles sont absentes du document.
    expect(screen.queryByRole('button', { name: 'Passer au thème clair' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'English' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Se déconnecter' })).toBeNull();
  });

  it('ouvre les trois commandes au clavier seul, sans souris', async () => {
    const user = userEvent.setup();
    renderWithPreferences(<BarreHaut onSignOut={vi.fn()} />);

    // `Tab` seul, pas `user.click` : c'est la preuve que le bouton de compte
    // est atteignable au clavier, pas seulement que c'est un <button>.
    await user.tab();
    const compte = screen.getByRole('button', { name: 'Préférences du compte' });
    expect(document.activeElement).toBe(compte);

    await user.keyboard('{Enter}');

    expect(await screen.findByRole('button', { name: 'Passer au thème clair' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'English' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeDefined();
  });

  it('bascule reellement le theme au clic, pas seulement le libelle du bouton', async () => {
    const user = userEvent.setup();
    renderWithPreferences(<BarreHaut onSignOut={vi.fn()} />);
    expect(document.documentElement.dataset['theme']).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Préférences du compte' }));
    await user.click(await screen.findByRole('button', { name: 'Passer au thème clair' }));

    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('bascule reellement la langue au clic : un autre libelle du meme composant passe en anglais', async () => {
    const user = userEvent.setup();
    renderWithPreferences(<BarreHaut onSignOut={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Préférences du compte' }));
    await user.click(await screen.findByRole('button', { name: 'English' }));

    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeDefined();
  });

  it('appelle le rappel de deconnexion', async () => {
    const user = userEvent.setup();
    const onSignOut = vi.fn();
    renderWithPreferences(<BarreHaut onSignOut={onSignOut} />);

    await user.click(screen.getByRole('button', { name: 'Préférences du compte' }));
    await user.click(await screen.findByRole('button', { name: 'Se déconnecter' }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('n affiche aucun champ de recherche quand l ecran appelant n en fournit pas', () => {
    renderWithPreferences(<BarreHaut onSignOut={vi.fn()} />);
    expect(screen.queryByRole('searchbox')).toBeNull();
  });

  it('affiche le champ de recherche fourni par l ecran appelant, sans en connaitre le fonctionnement', () => {
    renderWithPreferences(
      <BarreHaut
        onSignOut={vi.fn()}
        search={<input type="search" aria-label="recherche de test" />}
      />,
    );
    expect(screen.getByRole('searchbox', { name: 'recherche de test' })).toBeDefined();
  });

  it('n affiche aucun compteur de serie quand l ecran appelant n en fournit pas', () => {
    // Meme raison que `search` : `TodayScreen` (tache 8) rend `null` tant que
    // l'historique ne permet pas de trancher (voir `SerieEnTete`,
    // ui/BandeProgression.tsx), et `BarreHaut` ne doit alors rien afficher a
    // sa place — ni pastille grise, ni espace vide reserve.
    const { container } = renderWithPreferences(<BarreHaut onSignOut={vi.fn()} />);
    expect(container.querySelector('[data-ton]')).toBeNull();
  });

  it('affiche le compteur de serie fourni par l ecran appelant, sans en connaitre le fonctionnement', () => {
    renderWithPreferences(
      <BarreHaut onSignOut={vi.fn()} serie={<span data-ton="alerte">6 jours</span>} />,
    );
    expect(screen.getByText('6 jours')).toBeDefined();
  });
});
