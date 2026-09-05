import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import { LoginScreen } from './LoginScreen.js';

describe('LoginScreen', () => {
  it('associe une etiquette a chaque champ, un texte indicatif disparaissant a la saisie', async () => {
    renderWithPreferences(<LoginScreen onSignIn={vi.fn()} onSignInWithGoogle={vi.fn()} />);
    expect(screen.getByLabelText('Adresse e-mail')).toBeDefined();
    expect(screen.getByLabelText('Mot de passe')).toBeDefined();
  });

  it('ne propose aucune inscription, le compte etant unique et cree cote Supabase', () => {
    // Un formulaire d'inscription ouvert sur une base de prospection laisserait
    // n'importe qui se créer un compte `authenticated`, donc lire les 139
    // prospects : les politiques RLS n'ouvrent rien de moins que tout.
    renderWithPreferences(<LoginScreen onSignIn={vi.fn()} onSignInWithGoogle={vi.fn()} />);
    // Le seul bouton est celui de connexion, et il n'y a aucun lien : rien
    // n'ouvre de parcours de création de compte.
    // L'énumération, et non le décompte : ce qui compte est qu'AUCUN bouton
    // n'ouvre de parcours de création de compte, pas qu'il n'y en ait qu'un.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Se connecter',
      'Continuer avec Google',
    ]);
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.getByText(/Compte unique/)).toBeDefined();
  });

  it('propose la connexion Google, sans retirer celle par mot de passe', async () => {
    // D4 : le compte par mot de passe DOIT continuer de fonctionner — une
    // panne du fournisseur ne doit pas fermer l'application.
    const onSignInWithGoogle = vi.fn(async () => {});
    const onSignIn = vi.fn(async () => {});
    const user = userEvent.setup();

    renderWithPreferences(
      <LoginScreen onSignIn={onSignIn} onSignInWithGoogle={onSignInWithGoogle} />,
    );
    // Les champs sont remplis AVANT de cliquer sur Google, et c'est la
    // condition pour que l'assertion suivante prouve quoi que ce soit : un
    // formulaire dont les champs requis sont vides ne se soumet pas, et
    // l'absence d'appel serait alors vraie même sans `type="button"`.
    await user.type(screen.getByLabelText('Adresse e-mail'), 'contact@saisoneo.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'motdepasse');
    await user.click(screen.getByRole('button', { name: 'Continuer avec Google' }));

    expect(onSignInWithGoogle).toHaveBeenCalledTimes(1);
    // Et surtout PAS la soumission du formulaire : sans `type="button"`, le
    // bouton soumettrait le mot de passe en même temps qu'il ouvre Google.
    expect(onSignIn).not.toHaveBeenCalled();
    // Les deux coexistent : le formulaire mot de passe est toujours la.
    expect(screen.getByLabelText('Adresse e-mail')).toBeDefined();
    expect(screen.getByLabelText('Mot de passe')).toBeDefined();
  });

  it('dit pourquoi Google est necessaire, plutot que de le laisser deviner', () => {
    renderWithPreferences(<LoginScreen onSignIn={vi.fn()} onSignInWithGoogle={vi.fn()} />);
    expect(
      screen.getByText('Nécessaire pour envoyer les mails depuis votre compte.'),
    ).toBeDefined();
  });

  it('affiche l echec de Google pres du formulaire, comme celui du mot de passe', async () => {
    const onSignInWithGoogle = vi.fn().mockRejectedValue(new Error('popup_closed'));
    const user = userEvent.setup();

    renderWithPreferences(
      <LoginScreen onSignIn={vi.fn()} onSignInWithGoogle={onSignInWithGoogle} />,
    );
    await user.click(screen.getByRole('button', { name: 'Continuer avec Google' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('popup_closed');
  });

  it('desactive le bouton pendant l envoi, pour ne pas empiler les tentatives', async () => {
    let resoudre = () => {};
    const onSignIn = vi.fn(() => new Promise<void>((r) => { resoudre = r; }));
    const user = userEvent.setup();

    renderWithPreferences(<LoginScreen onSignIn={onSignIn} onSignInWithGoogle={vi.fn()} />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'contact@saisoneo.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'motdepasse');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Connexion…' }).hasAttribute('disabled')).toBe(
        true,
      ),
    );
    resoudre();
  });

  it('affiche l echec pres du formulaire plutot que dans la console', async () => {
    const onSignIn = vi.fn().mockRejectedValue(new Error('Invalid login credentials'));
    const user = userEvent.setup();

    renderWithPreferences(<LoginScreen onSignIn={onSignIn} onSignInWithGoogle={vi.fn()} />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'contact@saisoneo.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'faux');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain('incorrect');
  });

  it('reconnait le refus a son code stable, et non a un libelle anglais susceptible d etre reformule', async () => {
    // Supabase rend `error_code: 'invalid_credentials'` a cote du message.
    // S'appuyer sur le seul message ferait reapparaitre du texte technique
    // anglais a l'ecran le jour ou GoTrue le reformule — sans erreur, et sans
    // que personne ne s'en apercoive avant un utilisateur.
    const refus = Object.assign(new Error('Wrong email or password'), {
      code: 'invalid_credentials',
    });
    const onSignIn = vi.fn().mockRejectedValue(refus);
    const user = userEvent.setup();

    renderWithPreferences(<LoginScreen onSignIn={onSignIn} onSignInWithGoogle={vi.fn()} />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'contact@saisoneo.fr');
    await user.type(screen.getByLabelText('Mot de passe'), 'faux');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Adresse e-mail ou mot de passe incorrect.');
  });

  it('ne divulgue pas lequel des deux champs est faux', async () => {
    // Distinguer « adresse inconnue » de « mot de passe faux » permettrait
    // d'énumérer les comptes existants.
    const onSignIn = vi.fn().mockRejectedValue(new Error('Invalid login credentials'));
    const user = userEvent.setup();

    renderWithPreferences(<LoginScreen onSignIn={onSignIn} onSignInWithGoogle={vi.fn()} />);
    await user.type(screen.getByLabelText('Adresse e-mail'), 'inconnu@example.com');
    await user.type(screen.getByLabelText('Mot de passe'), 'x');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toBe('Adresse e-mail ou mot de passe incorrect.');
  });
});
