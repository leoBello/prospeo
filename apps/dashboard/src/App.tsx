import { useCallback, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { SCORING_RULESET, TRADES } from '@prospeo/core';
import { AuthProvider, useAuth } from './auth/AuthProvider.js';
import { createDashboardClient } from './data/supabase.js';
import { deposerJob, designerGabarit, retirerJob } from './data/mutations.js';
import { useProspects } from './data/useProspects.js';
import { useDeployments } from './data/useDeployments.js';
import { useCampagne } from './data/useCampagne.js';
import { useSiteTemplate } from './data/useSiteTemplate.js';
import { makePanelActions } from './ui/actions.js';
import { LoginScreen } from './screens/LoginScreen.js';
import { TodayScreen } from './screens/TodayScreen.js';
import { CampagneScreen } from './screens/CampagneScreen.js';
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
  // Même garde pour « Campagne » (chantier n°7).
  const campagneState = useCampagne(client, vue === 'campagne');
  const campagneReload = campagneState.reload;
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

  /**
   * Déposer une demande, et la retirer.
   *
   * On relit après une écriture réussie **en plus** de l'abonnement Realtime
   * de `useCampagne` : le même parti que le worker, qui écoute ET balaye. Une
   * socket muette ne doit pas laisser l'écran figé sur un clic qui, lui, est
   * bien parti.
   */
  const deposer = useCallback(
    (prospectId: string): Promise<string | null> =>
      deposerJob(client, prospectId).then((erreur) => {
        if (erreur === null) campagneReload();
        return erreur;
      }),
    [client, campagneReload],
  );

  const retirer = useCallback(
    (prospectId: string): Promise<string | null> =>
      retirerJob(client, prospectId).then((erreur) => {
        if (erreur === null) campagneReload();
        return erreur;
      }),
    [client, campagneReload],
  );

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

  // L'écran de campagne (chantier n°7, tâches 8-9), en lecture seule : même
  // patron que « Déploiements » ci-dessous, monté avant lui pour l'ordre du
  // rail (Aujourd'hui, Campagne, Déploiements, Gabarit — voir Nav.tsx).
  if (vue === 'campagne') {
    if (campagneState.status === 'loading') {
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

    if (campagneState.status === 'error') {
      return (
        <AppShell
          nav={nav}
          onSignOut={() => void signOut()}
          panel={null}
          list={
            <div className={styles.status} role="alert">
              <h1>{t('app.error.title')}</h1>
              <p>{campagneState.message}</p>
              <button type="button" onClick={campagneState.reload}>
                {t('app.error.retry')}
              </button>
            </div>
          }
        />
      );
    }

    return (
      <CampagneScreen
        lot={campagneState.lot}
        lignes={campagneState.lignes}
        totalProspects={campagneState.totalProspects}
        onDeposer={deposer}
        onRetirer={retirer}
        heartbeat={campagneState.heartbeat}
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

  // Les gardes de `useProspects` viennent APRÈS les trois branches ci-dessus,
  // et non avant : ni « Gabarit », ni « Campagne », ni « Déploiements » ne
  // consomment `prospects`. Placées plus haut, elles réduisaient l'application
  // entière à une boîte d'erreur sans rail de navigation dès qu'une lecture de
  // prospects échouait — impossible d'atteindre l'écran de déploiement,
  // c'est-à-dire précisément celui qu'on ouvre quand quelque chose ne va pas.
  // Et chaque chargement à froid de `#/deploiements` clignotait sans rail le
  // temps d'une lecture paginée sans rapport (relevé de revue, lot 2).
  if (state.status === 'loading') {
    // `aria-live` : le changement d'état est annoncé, sans quoi un lecteur
    // d'écran resterait sur l'écran précédent sans rien signaler.
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

  if (state.status === 'error') {
    // Le rail SURVIT à la lecture ratée : c'est ce qui laisse rejoindre un
    // écran qui, lui, n'a pas besoin des prospects.
    return (
      <AppShell
        nav={nav}
        onSignOut={() => void signOut()}
        panel={null}
        list={
          <div className={styles.status} role="alert">
            <h1>{t('app.error.title')}</h1>
            <p>{state.message}</p>
            <button type="button" onClick={state.reload}>
              {t('app.error.retry')}
            </button>
          </div>
        }
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
