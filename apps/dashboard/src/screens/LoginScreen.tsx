import { useState } from 'react';
import type { FormEvent } from 'react';
import { useT } from '../ui/preferences.js';
import styles from './LoginScreen.module.css';

/**
 * Le message que Supabase rend quand la paire e-mail / mot de passe est
 * refusée. Il ne dit pas lequel des deux est faux, et l'interface non plus :
 * distinguer les deux cas permettrait d'énumérer les comptes existants.
 */
const REFUS = 'Invalid login credentials';

interface Props {
  onSignIn: (email: string, password: string) => Promise<void>;
}

export function LoginScreen({ onSignIn }: Props) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(event: FormEvent) {
    event.preventDefault();
    setErreur(null);
    setEnvoi(true);
    try {
      await onSignIn(email, password);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setErreur(
        message.includes(REFUS)
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

        <p className={styles.note}>{t('auth.noSignup')}</p>
      </form>
    </main>
  );
}
