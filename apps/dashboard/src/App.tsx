import { useCallback, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { SCORING_RULESET, TRADES } from '@prospeo/core';
import { AuthProvider, useAuth } from './auth/AuthProvider.js';
import { createDashboardClient } from './data/supabase.js';
import { designerGabarit } from './data/mutations.js';
import { useProspects } from './data/useProspects.js';
import { useDeployments } from './data/useDeployments.js';
import { useSiteTemplate } from './data/useSiteTemplate.js';
import { makePanelActions } from './ui/actions.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { TodayScreen } from './screens/TodayScreen.js';
import { DeploiementsScreen } from './screens/DeploiementsScreen.js';
import { GabaritScreen } from './screens/GabaritScreen.js';
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
  // Appelé sans condition (règle des hooks) ; `enabled` évite la lecture
  // Supabase tant que l'écran « Déploiements » n'est pas affiché.
  const deploymentsState = useDeployments(client, vue === 'deploiements');
  // Même garde pour « Gabarit » (D10, chantier n°10).
  const gabaritState = useSiteTemplate(client, vue === 'gabarit');
  const gabaritReload = gabaritState.reload;

  // Mémorisées : recréées à chaque rendu, elles changeraient d'identité en
  // permanence et feraient rerendre la fiche entière à chaque frappe dans le
  // champ de note.
  const actions = useMemo(() => makePanelActions(client, reload), [client, reload]);

  /**
   * Enregistre la désignation, puis relit la ligne — même parti que
   * `makePanelActions` : l'écran entier doit dériver d'une seule lecture.
   *
   * Rend `null` en cas de succès et le message d'erreur sinon, comme
   * `PanelActions` : `GabaritScreen` porte désormais sa propre zone d'erreur
   * (`role="alert"`, clé `action.failed`) et a besoin de ce retour pour
   * l'alimenter. Avant ce correctif (relevé de revue, tâche 10) une écriture
   * refusée par la RLS n'était que journalisée en console — l'opérateur
   * croyait alors le changement pris.
   */
  const designer = useCallback(
    (repoFullName: string | null, branch: string): Promise<string | null> =>
      designerGabarit(client, repoFullName, branch).then((erreur) => {
        if (erreur === null) gabaritReload();
        return erreur;
      }),
    [client, gabaritReload],
  );

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

  // L'écran « Gabarit » (D10, chantier n°10) : branché sur l'écran réel,
  // comme « Déploiements » ci-dessous. `TRADES` vient de `@prospeo/core` —
  // jamais une liste recopiée dans l'écran.
  if (vue === 'gabarit') {
    if (gabaritState.status === 'loading') {
      return (
        <AppShell
          nav={nav}
          onSignOut={() => void signOut()}
          panel={null}
          list={
            <p className={styles.status} aria-live="polite">
              {t('app.loading')}
            </p>
          }
        />
      );
    }

    if (gabaritState.status === 'error') {
      return (
        <AppShell
          nav={nav}
          onSignOut={() => void signOut()}
          panel={null}
          list={
            <div className={styles.status} role="alert">
              <h1>{t('app.error.title')}</h1>
              <p>{gabaritState.message}</p>
              <button type="button" onClick={gabaritState.reload}>
                {t('app.error.retry')}
              </button>
            </div>
          }
        />
      );
    }

    return (
      <GabaritScreen
        template={gabaritState.template}
        trades={TRADES}
        onDesigner={designer}
        onSignOut={() => void signOut()}
        nav={nav}
      />
    );
  }

  if (vue === 'deploiements') {
    if (deploymentsState.status === 'loading') {
      return (
        <AppShell
          nav={nav}
          onSignOut={() => void signOut()}
          panel={null}
          list={
            <p className={styles.status} aria-live="polite">
              {t('app.loading')}
            </p>
          }
        />
      );
    }

    if (deploymentsState.status === 'error') {
      return (
        <AppShell
          nav={nav}
          onSignOut={() => void signOut()}
          panel={null}
          list={
            <div className={styles.status} role="alert">
              <h1>{t('app.error.title')}</h1>
              <p>{deploymentsState.message}</p>
              <button type="button" onClick={deploymentsState.reload}>
                {t('app.error.retry')}
              </button>
            </div>
          }
        />
      );
    }

    return (
      <DeploiementsScreen
        deployments={deploymentsState.deployments}
        onSignOut={() => void signOut()}
        nav={nav}
      />
    );
  }

  return (
    <TodayScreen
      prospects={state.prospects}
      currentRulesetVersion={SCORING_RULESET.version}
      onSignOut={() => void signOut()}
      actions={actions}
      client={client}
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
