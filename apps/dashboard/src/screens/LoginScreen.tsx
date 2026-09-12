import { useState } from 'react';
import type { FormEvent } from 'react';
import { useT } from '../ui/preferences.js';
import styles from './LoginScreen.module.css';

/**
 * Reconnaît un refus d'identifiants.
 *
 * Le code d'erreur d'abord : `invalid_credentials` fait partie du contrat de
 * l'API, là où le libellé est de la prose anglaise que GoTrue peut reformuler
 * d'une version à l'autre. Le jour où il le ferait, un test portant sur le
 * seul message laisserait passer le texte technique anglais jusqu'à l'écran,
 * sans erreur et sans que personne ne le remarque avant un utilisateur.
 *
 * Le libellé reste testé en second, pour les versions de GoTrue antérieures à
 * l'introduction des codes.
 *
 * Ni l'un ni l'autre ne dit lequel des deux champs est faux, et l'interface
 * non plus : distinguer les deux cas permettrait d'énumérer les comptes.
 */
function estRefusIdentifiants(cause: unknown): boolean {
  if (typeof cause !== 'object' || cause === null) return false;
  const { code, message } = cause as { code?: unknown; message?: unknown };
  if (code === 'invalid_credentials') return true;
  return typeof message === 'string' && message.includes('Invalid login credentials');
}

interface Props {
  onSignIn: (email: string, password: string) => Promise<void>;
  /**
   * Ouvre le flux Google. Distincte de `onSignIn` et non pas un mode de
   * celle-ci : D4 veut que le mot de passe continue de fonctionner seul, une
   * panne du fournisseur ne devant pas fermer l'application.
   */
  onSignInWithGoogle: () => Promise<void>;
}

export function LoginScreen({ onSignIn, onSignInWithGoogle }: Props) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function connecterAvecGoogle() {
    setErreur(null);
    setEnvoi(true);
    try {
      // En cas de succès la page part chez Google : `setEnvoi(false)` du
      // `finally` ne s'exécutera jamais, et c'est bien ainsi — un bouton
      // redevenu actionnable pendant la redirection inviterait à cliquer deux
      // fois.
      await onSignInWithGoogle();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setErreur(t('auth.error.generic', { message }));
    } finally {
      setEnvoi(false);
    }
  }

  async function soumettre(event: FormEvent) {
    event.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await onSignIn(email, password);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setErreur(
        estRefusIdentifiants(cause)
          ? t('auth.error.credentials')
          : t('auth.error.generic', { message }),
      );
    } finally {
      // Dans le `finally` : sur une erreur, le bouton doit redevenir
      // actionnable, sans quoi une faute de frappe condamne l'écran jusqu'au
      // rechargement.
      setEnvoi(false);
    }
  }

  return (
    <main className={styles.page}>
      <form className={styles.card} onSubmit={soumettre}>
        <h1 className={styles.title}>{t('auth.title')}</h1>
        <p className={styles.subtitle}>{t('auth.subtitle')}</p>

        <label className={styles.label} htmlFor="email">
          {t('auth.email')}
        </label>
        <input
          id="email"
          className={styles.input}
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label className={styles.label} htmlFor="password">
          {t('auth.password')}
        </label>
        <input
          id="password"
          className={styles.input}
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {/* `role="alert"` : l'échec est annoncé aux lecteurs d'écran, qui
            sinon ne verraient rien apparaître sous le bouton. */}
        {erreur !== null ? (
          <p className={styles.error} role="alert">
            {erreur}
          </p>
        ) : null}

        <button className={styles.submit} type="submit" disabled={envoi}>
          {envoi ? t('auth.pending') : t('auth.submit')}
        </button>

        {/* `type="button"` : sans lui, il soumettrait le formulaire de mot de
            passe au lieu d'ouvrir Google. */}
        <button
          className={styles.google}
          type="button"
          disabled={envoi}
          onClick={() => void connecterAvecGoogle()}
        >
          {t('auth.google')}
        </button>
        <p className={styles.note}>{t('auth.googleAide')}</p>

        <p className={styles.note}>{t('auth.noSignup')}</p>
      </form>
    </main>
  );
}
