import { useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { SCORING_RULESET } from '@prospeo/core';
import { AuthProvider, useAuth } from './auth/AuthProvider.js';
import { createDashboardClient } from './data/supabase.js';
import { useProspects } from './data/useProspects.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { TodayScreen } from './screens/TodayScreen.js';
import { PreferencesProvider, useT } from './ui/preferences.js';
import styles from './App.module.css';

/**
 * Écran d'erreur de configuration.
 *
 * Volontairement hors du fournisseur d'i18n et sans traduction : il s'affiche
 * quand rien ne peut démarrer, y compris potentiellement l'i18n. Un écran
 * blanc laisserait chercher dans la console d'un bundle minifié.
 */
function ConfigError({ message }: { message: string }) {
  return (
    <main className={styles.fatal}>
      <h1>Configuration invalide</h1>
      <p>{message}</p>
      <p className={styles.fatalHint}>
        Renseigner <code>VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code> dans{' '}
        <code>.env</code>, puis relancer <code>pnpm dev</code>. Voir <code>.env.example</code>.
      </p>
    </main>
  );
}

function Authenticated({ client }: { client: SupabaseClient<Database> }) {
  const t = useT();
  const { signOut } = useAuth();
  const state = useProspects(client);

  if (state.status === 'loading') {
    // `aria-live` : le changement d'état est annoncé, sans quoi un lecteur
    // d'écran resterait sur l'écran précédent sans rien signaler.
    return (
      <p className={styles.status} aria-live="polite">
        {t('app.loading')}
      </p>
    );
  }

  if (state.status === 'error') {
    return (
      <div className={styles.status} role="alert">
        <h1>{t('app.error.title')}</h1>
        <p>{state.message}</p>
        <button type="button" onClick={state.reload}>
          {t('app.error.retry')}
        </button>
      </div>
    );
  }

  return (
    <TodayScreen
      prospects={state.prospects}
      currentRulesetVersion={SCORING_RULESET.version}
      onSignOut={() => void signOut()}
    />
  );
}

function Gate({ client }: { client: SupabaseClient<Database> }) {
  const t = useT();
  const { session, signIn } = useAuth();

  // `undefined` : la session stockée n'a pas encore été relue. Confondre cet
  // état avec « pas connecté » ferait clignoter l'écran de connexion à chaque
  // chargement de page.
  if (session === undefined) {
    return (
      <p className={styles.status} aria-live="polite">
        {t('app.loading')}
      </p>
    );
  }

  if (session === null) return <LoginScreen onSignIn={signIn} />;

  return <Authenticated client={client} />;
}

export function App() {
  // `useMemo` sans dépendances : un client recréé à chaque rendu relancerait
  // l'abonnement d'authentification et la lecture des prospects en boucle.
  const client = useMemo(() => {
    try {
      return { ok: true as const, client: createDashboardClient(import.meta.env) };
    } catch (cause) {
      return { ok: false as const, message: cause instanceof Error ? cause.message : String(cause) };
    }
  }, []);

  if (!client.ok) return <ConfigError message={client.message} />;

  return (
    <PreferencesProvider>
      <AuthProvider client={client.client}>
        <Gate client={client.client} />
      </AuthProvider>
    </PreferencesProvider>
  );
}
