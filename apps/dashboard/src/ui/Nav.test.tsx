import { afterEach, describe, expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import { fr } from '../i18n/fr.js';
import { Nav, useVue } from './Nav.js';

/**
 * Petit harnais : `useVue` et `Nav` sont deux moitiés d'une même mécanique
 * (l'un lit/écrit le fragment, l'autre l'affiche et le déclenche). Les tester
 * ensemble, à travers un composant hôte, prouve le comportement observable —
 * le fragment et la vue rendue — plutôt que l'un des deux isolément.
 */
function Harnais() {
  const { vue, aller } = useVue();
  return (
    <div>
      <p data-testid="vue-courante">{vue}</p>
      <Nav vue={vue} aller={aller} />
    </div>
  );
}

describe('useVue et Nav', () => {
  afterEach(() => {
    // Le fragment vit sur `window.location`, partagé entre les tests de ce
    // fichier : sans remise à zéro, l'ordre d'exécution changerait le
    // résultat.
    window.location.hash = '';
  });

  it('suit la vue du fragment d url au montage', () => {
    window.location.hash = '#/deploiements';
    renderWithPreferences(<Harnais />);
    expect(screen.getByTestId('vue-courante').textContent).toBe('deploiements');
  });

  it('retombe sur today quand le fragment est inconnu, sans ecran blanc', () => {
    window.location.hash = '#/n-existe-pas';
    renderWithPreferences(<Harnais />);
    expect(screen.getByTestId('vue-courante').textContent).toBe('today');
  });

  it('change la vue et le fragment au clic sur une entree', async () => {
    const utilisateur = userEvent.setup();
    renderWithPreferences(<Harnais />);

    await utilisateur.click(screen.getByRole('button', { name: fr['nav.deploiements'] }));

    expect(screen.getByTestId('vue-courante').textContent).toBe('deploiements');
    expect(window.location.hash).toBe('#/deploiements');
  });

  it('reagit a un hashchange externe, comme le bouton Precedent du navigateur', () => {
    renderWithPreferences(<Harnais />);
    expect(screen.getByTestId('vue-courante').textContent).toBe('today');

    // Simule le navigateur qui restaure un fragment après un clic sur
    // Précédent : ni `aller` ni aucun clic ne sont en jeu ici.
    window.location.hash = '#/gabarit';
    fireEvent(window, new Event('hashchange'));

    expect(screen.getByTestId('vue-courante').textContent).toBe('gabarit');
  });

  it("marque l entree active par aria-current, pas seulement par la couleur", async () => {
    const utilisateur = userEvent.setup();
    renderWithPreferences(<Harnais />);

    const boutonToday = screen.getByRole('button', { name: fr['nav.today'] });
    const boutonDeploiements = screen.getByRole('button', { name: fr['nav.deploiements'] });

    expect(boutonToday.getAttribute('aria-current')).toBe('page');
    expect(boutonDeploiements.getAttribute('aria-current')).toBeNull();

    await utilisateur.click(boutonDeploiements);

    expect(boutonDeploiements.getAttribute('aria-current')).toBe('page');
    expect(boutonToday.getAttribute('aria-current')).toBeNull();
  });

  it('nomme chaque entree malgre son icone seule', () => {
    renderWithPreferences(<Harnais />);
    expect(screen.getByRole('button', { name: fr['nav.today'] })).toBeDefined();
    expect(screen.getByRole('button', { name: fr['nav.deploiements'] })).toBeDefined();
    expect(screen.getByRole('button', { name: fr['nav.gabarit'] })).toBeDefined();
  });
});
