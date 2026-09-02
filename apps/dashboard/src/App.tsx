import { useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { SCORING_RULESET } from '@prospeo/core';
import { AuthProvider, useAuth } from './auth/AuthProvider.js';
import { createDashboardClient } from './data/supabase.js';
import { useProspects } from './data/useProspects.js';
import { makePanelActions } from './ui/actions.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { TodayScreen } from './screens/TodayScreen.js';
import { AppShell } from './ui/AppShell.js';
import { Nav, useVue } from './ui/Nav.js';
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
  const reload = state.reload;
  // La vue vit dans le fragment d'URL (voir Nav.tsx) : elle survit à un
  // rechargement, et un lien vers l'écran de déploiement est possible à
  // donner — deux choses qu'un simple `useState` ne permettrait pas.
  const { vue, aller } = useVue();
  const nav = <Nav vue={vue} aller={aller} />;

  // Mémorisées : recréées à chaque rendu, elles changeraient d'identité en
  // permanence et feraient rerendre la fiche entière à chaque frappe dans le
  // champ de note.
  const actions = useMemo(() => makePanelActions(client, reload), [client, reload]);

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

  // Les écrans « Déploiements » et « Gabarit » n'existent pas encore : un
  // repère minimal, sous la coquille commune, suffit à rendre la navigation
  // testable dès maintenant. Les lots suivants remplacent ce repère par
  // l'écran réel, sans toucher à la navigation elle-même.
  if (vue === 'deploiements' || vue === 'gabarit') {
    return (
      <AppShell
        nav={nav}
        onSignOut={() => void signOut()}
        list={
          <p className={styles.status} aria-live="polite">
            {t('bientot.aria')}
          </p>
        }
        panel={null}
      />
    );
  }

  return (
    <TodayScreen
      prospects={state.prospects}
      currentRulesetVersion={SCORING_RULESET.version}
      onSignOut={() => void signOut()}
      actions={actions}
      nav={nav}
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
