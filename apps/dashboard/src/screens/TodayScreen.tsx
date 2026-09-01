import { useEffect, useMemo } from 'react';
import type { ProspectView } from '../domain/prospect.js';
import { buildToday, computeKpis } from '../domain/today.js';
import { AppShell } from '../ui/AppShell.js';
import { KpiBand } from '../ui/KpiBand.js';
import { ProspectPanel } from '../ui/ProspectPanel.js';
import { WorkListSection } from '../ui/WorkListSection.js';
import { useListNavigation } from '../ui/useListNavigation.js';
import { useT } from '../ui/preferences.js';
import styles from './TodayScreen.module.css';

interface Props {
  prospects: ProspectView[];
  currentRulesetVersion: string;
  now?: Date;
  onSignOut: () => void;
}

export function TodayScreen({ prospects, currentRulesetVersion, now, onSignOut }: Props) {
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
      [...today.followUps.items, ...today.newHighScore.items, ...today.awaiting.items].map(
        (row) => row.prospect.id,
      ),
    [today],
  );

  const { selectedId, panelOpen, select, close } = useListNavigation(ids);

  const selected = useMemo(
    () => prospects.find((p) => p.id === selectedId) ?? null,
    [prospects, selectedId],
  );

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
          <WorkListSection
            titleKey="today.section.awaiting"
            emptyKey="today.empty.awaiting"
            hintKey="today.section.awaiting.hint"
            list={today.awaiting}
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
          />
        ) : null
      }
    />
  );
}
