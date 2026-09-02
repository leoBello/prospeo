import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { ProspectView } from '../domain/prospect.js';
import { buildToday, computeKpis } from '../domain/today.js';
import { AppShell } from '../ui/AppShell.js';
import { KpiBand } from '../ui/KpiBand.js';
import { ProspectPanel } from '../ui/ProspectPanel.js';
import type { PanelActions } from '../ui/actions.js';
import { WorkListSection } from '../ui/WorkListSection.js';
import { useListNavigation } from '../ui/useListNavigation.js';
import { useDeploymentEvents } from '../data/useDeploymentEvents.js';
import { useT } from '../ui/preferences.js';
import styles from './TodayScreen.module.css';

interface Props {
  prospects: ProspectView[];
  currentRulesetVersion: string;
  now?: Date;
  onSignOut: () => void;
  /** `null` : écran consultable seul, ce que montent les tests. */
  actions?: PanelActions | null;
  /**
   * Le client Supabase, pour le journal de déploiement du prospect ouvert.
   *
   * `null` par défaut, comme `actions` : les tests de cet écran le montent
   * sans réseau, et un client absent revient pour `useDeploymentEvents` à ne
   * jamais lire — pas à échouer.
   */
  client?: SupabaseClient<Database> | null;
  /**
   * Le rail de navigation, fourni par `App`. Absent dans les tests de cet
   * écran, montré seul : `AppShell` s'en passe alors sans rien afficher à
   * gauche.
   */
  nav?: ReactNode;
}

export function TodayScreen({
  prospects,
  currentRulesetVersion,
  now,
  onSignOut,
  actions = null,
  client = null,
  nav,
}: Props) {
  const t = useT();
  // Mémorisé : une `Date` reconstruite à chaque rendu changerait d'identité en
  // permanence et recomposerait les listes sans fin.
  const instant = useMemo(() => now ?? new Date(), [now]);

  const today = useMemo(() => buildToday(prospects, instant), [prospects, instant]);
  const kpis = useMemo(() => computeKpis(prospects), [prospects]);

  /**
   * L'ordre du parcours clavier est l'ordre visuel, sections concaténées.
   *
   * Les flèches doivent traverser les listes sans s'arrêter à leur frontière :
   * une file de travail se descend d'un bout à l'autre, et buter en fin de
   * section obligerait à reprendre la souris à chaque titre.
   */
  const ids = useMemo(
    () =>
      [...today.followUps.items, ...today.newHighScore.items].map((row) => row.prospect.id),
    [today],
  );

  const { selectedId, panelOpen, select, close } = useListNavigation(ids);

  const selected = useMemo(
    () => prospects.find((p) => p.id === selectedId) ?? null,
    [prospects, selectedId],
  );

  /**
   * Le journal de déploiement du prospect ouvert (tâche 11).
   *
   * Câblé ici, pas dans `ProspectPanel` ni dans `HistoriqueTab` : c'est ce
   * composant qui connaît déjà la sélection (`selectedId`) et sait quand le
   * panneau est réellement affiché (`panelOpen`) — le lui faire redécouvrir
   * dans un composant plus bas dupliquerait cet état. Un identifiant par
   * prospect, fourni à `ProspectPanel` sous forme d'un simple tableau, garde
   * ce dernier — et `HistoriqueTab` sous lui — testables sans réseau,
   * exactement comme `actions` ci-dessus.
   *
   * `panelOpen ? selectedId : null` et non `selectedId` seul : fermer le
   * panneau (Échap) ne vide pas la sélection — elle reste surlignée dans la
   * liste, voir `useListNavigation.close` — mais plus aucun panneau n'affiche
   * ce journal tant qu'il reste fermé. Lire quand même serait la lecture
   * inutile que la consigne interdit.
   */
  const eventsState = useDeploymentEvents(client, panelOpen ? selectedId : null);
  const events = eventsState.status === 'ready' ? eventsState.events : undefined;
  // Distinct de `events` absent : un `status: 'error'` est une lecture
  // ratée, pas un prospect sans historique — voir le docstring de
  // `HistoriqueTab` sur `erreurEvenements` (tâche 11, relevé de revue).
  const erreurEvenements = eventsState.status === 'error' ? eventsState.message : null;

  useEffect(() => {
    if (selectedId === null) return;
    const ligne = document.getElementById(`prospect-${selectedId}`);
    // `scrollIntoView` manque à jsdom, et manquerait aussi à tout
    // environnement sans mise en page : la garde évite de faire échouer le
    // rendu pour un confort de défilement.
    if (typeof ligne?.scrollIntoView === 'function') {
      ligne.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedId]);

  const position =
    selectedId === null
      ? null
      : { index: ids.indexOf(selectedId) + 1, total: ids.length };

  return (
    <AppShell
      onSignOut={onSignOut}
      nav={nav}
      list={
        <>
          <div className={styles.intro}>
            <h1 className={styles.title}>{t('today.title')}</h1>
            <p className={styles.subtitle}>{t('today.subtitle')}</p>
          </div>

          <KpiBand kpis={kpis} />

          <p className={styles.hint}>{t('list.keyboardHint')}</p>

          <WorkListSection
            titleKey="today.section.followUps"
            emptyKey="today.empty.followUps"
            list={today.followUps}
            selectedId={selectedId}
            currentRulesetVersion={currentRulesetVersion}
            onSelect={select}
          />
          <WorkListSection
            titleKey="today.section.newHighScore"
            emptyKey="today.empty.newHighScore"
            list={today.newHighScore}
            selectedId={selectedId}
            currentRulesetVersion={currentRulesetVersion}
            onSelect={select}
          />
        </>
      }
      panel={
        panelOpen ? (
          <ProspectPanel
            prospect={selected}
            position={position}
            currentRulesetVersion={currentRulesetVersion}
            onClose={close}
            actions={actions}
            events={events}
            erreurEvenements={erreurEvenements}
            onReessayerEvenements={eventsState.reload}
          />
        ) : null
      }
    />
  );
}
