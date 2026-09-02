import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { ProspectView, WorkList } from '../domain/prospect.js';
import { buildToday, computeKpis, matchesQuery } from '../domain/today.js';
import type { TranslationKey } from '../i18n/translate.js';
import { AppShell } from '../ui/AppShell.js';
import { KpiBand } from '../ui/KpiBand.js';
import { ProspectPanel } from '../ui/ProspectPanel.js';
import type { PanelActions } from '../ui/actions.js';
import { WorkListSection } from '../ui/WorkListSection.js';
import { useListNavigation } from '../ui/useListNavigation.js';
import { useDeploymentEvents } from '../data/useDeploymentEvents.js';
import { useT } from '../ui/preferences.js';
import { estMac } from '../ui/plateforme.js';
import styles from './TodayScreen.module.css';

const TRAIT_RECHERCHE = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  'aria-hidden': true,
} as const;

function IconeRecherche() {
  return (
    <svg {...TRAIT_RECHERCHE}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

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

  // La recherche de la barre du haut (lot 3, tâche 2) : elle filtre les
  // listes de travail déjà chargées en mémoire, jamais les 139 prospects de
  // la base — d'où son application ICI, en amont de `buildToday`, et pas sur
  // un écran séparé.
  const [recherche, setRecherche] = useState('');
  const champRechercheRef = useRef<HTMLInputElement>(null);

  const prospectsFiltres = useMemo(
    () => (recherche.trim() === '' ? prospects : prospects.filter((p) => matchesQuery(p, recherche))),
    [prospects, recherche],
  );

  const today = useMemo(() => buildToday(prospectsFiltres, instant), [prospectsFiltres, instant]);
  // Non filtrée : sert uniquement à distinguer, quand une liste est vide,
  // une recherche sans résultat d'une liste réellement vide pour une autre
  // raison — deux absences que `today.empty.search` et `today.empty.*` ne
  // doivent pas confondre (voir `clefAbsence` ci-dessous).
  const todaySansRecherche = useMemo(() => buildToday(prospects, instant), [prospects, instant]);
  // Les indicateurs portent sur la base entière, jamais sur la recherche :
  // « En base » doit rester 139 pendant qu'on tape, pas se réduire au nombre
  // de lignes qui correspondent au texte tapé.
  const kpis = useMemo(() => computeKpis(prospects), [prospects]);

  /**
   * Choisit le texte d'un vide de liste : celui de la recherche sans
   * résultat quand elle explique le vide, celui de la liste elle-même sinon.
   *
   * `base.totalCount > 0` est la condition qui les distingue : si la liste
   * était déjà vide sans la moindre recherche, ce n'est pas la recherche qui
   * la vide, et lui attribuer le message de recherche mentirait sur la cause.
   */
  const clefAbsence = (base: WorkList, filtree: WorkList, defaut: TranslationKey): TranslationKey =>
    recherche.trim() !== '' && base.totalCount > 0 && filtree.totalCount === 0
      ? 'today.empty.search'
      : defaut;

  // Raccourci clavier de la recherche : `⌘K` sur macOS, `Ctrl+K` ailleurs
  // (voir `ui/plateforme.ts`) — écoute les deux touches de modification et
  // n'affiche que celle qui fonctionne réellement sur la plateforme
  // détectée (décision du pilote, lot 3 tâche 2).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      // Sans cela, certains navigateurs ouvrent leur propre recherche : le
      // raccourci annoncé perdrait face au raccourci natif.
      event.preventDefault();
      champRechercheRef.current?.focus();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // `navigator` ne change pas en cours de session : la détection n'a besoin
  // d'être refaite qu'une fois.
  const modificateur = useMemo(() => (estMac() ? '⌘' : 'Ctrl+'), []);

  const libelleRecherche = t('header.search.label');
  const champRecherche = (
    <div className={styles.recherche}>
      <IconeRecherche />
      <input
        ref={champRechercheRef}
        type="search"
        className={styles.rechercheChamp}
        value={recherche}
        onChange={(event) => setRecherche(event.target.value)}
        placeholder={libelleRecherche}
        aria-label={libelleRecherche}
      />
      <span className={styles.rechercheRaccourci} aria-hidden="true">
        {t('header.search.shortcut', { modifier: modificateur })}
      </span>
    </div>
  );

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
  // `'loading'` distinct d'`'idle'` : le hook plaide pour cette distinction
  // dans son propre docstring, et la replier ici sur `events: undefined`
  // faisait afficher « Aucun événement enregistré » pendant tout
  // l'aller-retour réseau — une affirmation sur l'histoire du prospect,
  // énoncée avant toute réponse (relevé de revue, lot 2).
  const chargementEvenements = eventsState.status === 'loading';

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
      search={champRecherche}
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
            emptyKey={clefAbsence(todaySansRecherche.followUps, today.followUps, 'today.empty.followUps')}
            list={today.followUps}
            selectedId={selectedId}
            currentRulesetVersion={currentRulesetVersion}
            onSelect={select}
          />
          <WorkListSection
            titleKey="today.section.newHighScore"
            emptyKey={clefAbsence(todaySansRecherche.newHighScore, today.newHighScore, 'today.empty.newHighScore')}
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
            chargementEvenements={chargementEvenements}
            onReessayerEvenements={eventsState.reload}
          />
        ) : null
      }
    />
  );
}
