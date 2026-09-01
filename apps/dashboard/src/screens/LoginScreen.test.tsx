import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import { LoginScreen } from './LoginScreen.js';

describe('LoginScreen', () => {
  it('associe une etiquette a chaque champ, un texte indicatif disparaissant a la saisie', async () => {
    renderWithPreferences(<LoginScreen onSignIn={vi.fn()} />);
    expect(screen.getByLabelText('Adresse e-mail')).toBeDefined();
    expect(screen.getByLabelText('Mot de passe')).toBeDefined();
  });

  it('ne propose aucune inscription, le compte etant unique et cree cote Supabase', () => {
    // Un formulaire d'inscription ouvert sur une base de prospection laisserait
    // n'importe qui se créer un compte `authenticated`, donc lire les 139
    // prospects : les politiques RLS n'ouvrent rien de moins que tout.
    renderWithPreferences(<LoginScreen onSignIn={vi.fn()} />);
    // Le seul bouton est celui de connexion, et il n'y a aucun lien : rien
    // n'ouvre de parcours de création de compte.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['Se connecter']);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(/Compte unique/)).toBeDefined();
  });

  it('desactive le bouton pendant l envoi, pour ne pas empiler les tentatives', async () => {
    let resoudre = () => {};
    const onSignIn = vi.fn(() => new Promise<void>((r) => { resoudre = r; }));
    const user = userEvent.setup();

    renderWithPreferences(<LoginScreen onSignIn={onSignIn} />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'contact@saisoneo.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'motdepasse');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() => expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true));
    resoudre();
  });

  it('affiche l echec pres du formulaire plutot que dans la console', async () => {
    const onSignIn = vi.fn().mockRejectedValue(new Error('Invalid login credentials'));
    const user = userEvent.setup();

    renderWithPreferences(<LoginScreen onSignIn={onSignIn} />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'contact@saisoneo.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'faux');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('incorrect');
  });

  it('ne divulgue pas lequel des deux champs est faux', async () => {
    // Distinguer « adresse inconnue » de « mot de passe faux » permettrait
    // d'énumérer les comptes existants.
    const onSignIn = vi.fn().mockRejectedValue(new Error('Invalid login credentials'));
    const user = userEvent.setup();

    renderWithPreferences(<LoginScreen onSignIn={onSignIn} />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'inconnu@example.com');
    await user.type(screen.getByLabelText('Mot de passe'), 'x');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Adresse e-mail ou mot de passe incorrect.');
  });
});
