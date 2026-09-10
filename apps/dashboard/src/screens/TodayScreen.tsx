import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import type { ProspectView, WorkList } from '../domain/prospect.js';
import { buildToday, matchesQuery } from '../domain/today.js';
import { comptesVeille, pageVeille } from '../domain/veille.js';
import type { OngletVeille, OrdreVeille } from '../domain/veille.js';
import type { TranslationKey } from '../i18n/translate.js';
import { AppShell } from '../ui/AppShell.js';
import { SerieEnTete } from '../ui/BandeProgression.js';
import { BriefDuJour } from '../ui/BriefDuJour.js';
import { ProspectPanel } from '../ui/ProspectPanel.js';
import type { ProspectPanelPosition } from '../ui/ProspectPanel.js';
import type { PanelActions } from '../ui/actions.js';
import { TableVeille } from '../ui/TableVeille.js';
import { useListNavigation } from '../ui/useListNavigation.js';
import { useDeploymentEvents } from '../data/useDeploymentEvents.js';
import { useJeu } from '../data/useJeu.js';
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

  // La recherche de la barre du haut (lot 3, tâche 2) : elle filtre ce qui
  // est déjà chargé en mémoire, sans une requête de plus — d'où son
  // application ICI, une seule fois, en amont de `buildToday` comme de
  // `comptesVeille`/`pageVeille`. Depuis que la table montre toute la base
  // (tâche 9), elle la couvre donc entièrement, et non plus deux listes de
  // douze lignes.
  const [recherche, setRecherche] = useState('');
  const champRechercheRef = useRef<HTMLInputElement>(null);

  const prospectsFiltres = useMemo(
    () => (recherche.trim() === '' ? prospects : prospects.filter((p) => matchesQuery(p, recherche))),
    [prospects, recherche],
  );

  const [onglet, setOnglet] = useState<OngletVeille>('a_contacter');
  const [numeroPage, setNumeroPage] = useState(1);
  const [ordre, setOrdre] = useState<OrdreVeille>('score_desc');

  const comptes = useMemo(() => comptesVeille(prospectsFiltres), [prospectsFiltres]);
  const page = useMemo(
    () => pageVeille(prospectsFiltres, onglet, ordre, numeroPage),
    [prospectsFiltres, onglet, ordre, numeroPage],
  );

  /**
   * Changer d'onglet, d'ordre ou de recherche ramène à la première page.
   *
   * Sans cela, passer d'un onglet de treize pages à un onglet d'une page
   * afficherait une table vide sur un onglet plein. `pageVeille` borne déjà la
   * page rendue ; ce que ce geste corrige, c'est l'état, qui resterait sinon
   * sur un numéro que plus rien ne justifie.
   */
  const choisirOnglet = useCallback((cible: OngletVeille) => {
    setOnglet(cible);
    setNumeroPage(1);
  }, []);

  const basculerOrdre = useCallback(() => {
    setOrdre((courant) => (courant === 'score_desc' ? 'score_asc' : 'score_desc'));
    setNumeroPage(1);
  }, []);

  const effacerRecherche = useCallback(() => {
    setRecherche('');
    setNumeroPage(1);
  }, []);

  /**
   * Ce que l'onglet courant contiendrait SANS la recherche.
   *
   * C'est la seule chose qui distingue « votre recherche ne rend rien » de
   * « personne n'est jamais passé par cet onglet » — deux absences de natures
   * différentes, que `TableVeille` rend de deux façons. Calculé sur
   * `prospects`, jamais sur `prospectsFiltres`, sans quoi il vaudrait
   * toujours zéro au moment précis où il sert.
   */
  const ongletPleinSansRecherche = useMemo(
    () => comptesVeille(prospects).parOnglet[onglet],
    [prospects, onglet],
  );

  const today = useMemo(() => buildToday(prospectsFiltres, instant), [prospectsFiltres, instant]);
  // Non filtrée : sert uniquement à distinguer, quand une liste est vide,
  // une recherche sans résultat d'une liste réellement vide pour une autre
  // raison — deux absences que `today.empty.search` et `today.empty.*` ne
  // doivent pas confondre (voir `clefAbsence` ci-dessous).
  const todaySansRecherche = useMemo(() => buildToday(prospects, instant), [prospects, instant]);

  /**
   * Le jeu (D5, tâche 8) : objectif du jour, palier, jalons — voir
   * `ui/BandeProgression.tsx`.
   *
   * `useJeu` (tâche 7) exige un client non nul, contrairement à
   * `useDeploymentEvents` ci-dessous : ses seuls appelants jusqu'ici
   * (`Authenticated`, via `useDeployments`/`useSiteTemplate`) en fournissent
   * toujours un réel. Cet écran, lui, se monte aussi dans des tests sans
   * client (comme `actions` ci-dessus) — la coercition de type qui suit est
   * sans risque : `enabled` retombe alors à `false`, et `fetchJeu` n'est
   * jamais appelé.
   */
  const jeuState = useJeu(client as SupabaseClient<Database>, client !== null);

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
        onChange={(event) => {
          setRecherche(event.target.value);
          setNumeroPage(1);
        }}
        placeholder={libelleRecherche}
        aria-label={libelleRecherche}
      />
      <span className={styles.rechercheRaccourci} aria-hidden="true">
        {t('header.search.shortcut', { modifier: modificateur })}
      </span>
    </div>
  );

  /**
   * L'ordre du parcours clavier est l'ordre visuel : les relances dues, puis
   * la page courante de la table.
   *
   * Les flèches doivent traverser les deux sans s'arrêter à leur frontière :
   * buter en fin de bande obligerait à reprendre la souris pour entrer dans
   * la table.
   *
   * Dédoublonné : un prospect relancé figure dans les DEUX (décision 2A, la
   * bande et son onglet de statut se recouvrent), et `indexOf` ramènerait
   * toujours à sa première occurrence — les flèches buteraient sur lui.
   */
  const ids = useMemo(() => {
    const vus = new Set<string>();
    const sortie: string[] = [];
    for (const id of [
      ...today.followUps.items.map((row) => row.prospect.id),
      ...page.lignes.map((p) => p.id),
    ]) {
      if (vus.has(id)) continue;
      vus.add(id);
      sortie.push(id);
    }
    return sortie;
  }, [today, page]);

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

  /**
   * Le rang affiché dans le panneau, relatif aux `ids` COURANTS (déjà
   * filtrés par la recherche).
   *
   * Un prospect ouvert avant que la recherche ne l'exclue reste sélectionné
   * — `useListNavigation` ne le sait pas et ne ferme rien, exactement le
   * réflexe déjà pris par `navigate` pour une ligne disparue (voir
   * `ui/list-navigation.ts`) — mais son rang dans une liste qui ne le
   * contient plus n'existe pas : `ids.indexOf` rendrait -1, soit un rang
   * « 0 sur N », ou pire « 0 sur 0 » si le filtre ne laisse plus personne.
   * `horsFiltre` nomme cette absence au lieu de mentir par un chiffre.
   */
  const rang = selectedId === null ? -1 : ids.indexOf(selectedId);
  const position: ProspectPanelPosition | null =
    selectedId === null
      ? null
      : rang === -1
        ? { kind: 'horsFiltre' }
        : { kind: 'rang', index: rang + 1, total: ids.length };

  return (
    <AppShell
      onSignOut={onSignOut}
      nav={nav}
      search={champRecherche}
      serie={<SerieEnTete jeu={jeuState} />}
      list={
        <>
          <div className={styles.intro}>
            <h1 className={styles.title}>{t('today.title')}</h1>
            <p className={styles.subtitle}>{t('today.subtitle')}</p>
          </div>

          <p className={styles.hint}>{t('list.keyboardHint')}</p>

          {/* `BriefDuJour` monte lui-même la bande de progression et la file
              des relances dues, et tient son repli via `usePreferences` : cet
              écran ne connaît que ce qu'il lui donne à afficher. */}
          <BriefDuJour
            jeu={jeuState}
            relances={today.followUps}
            selectedId={selectedId}
            currentRulesetVersion={currentRulesetVersion}
            emptyKey={clefAbsence(todaySansRecherche.followUps, today.followUps, 'today.empty.followUps')}
            now={instant}
            onSelect={select}
          />

          <TableVeille
            onglet={onglet}
            comptes={comptes}
            page={page}
            ordre={ordre}
            totalEnBase={prospects.length}
            selectedId={selectedId}
            now={instant}
            recherche={recherche}
            ongletPleinSansRecherche={ongletPleinSansRecherche}
            onChoisirOnglet={choisirOnglet}
            onAllerPage={setNumeroPage}
            onBasculerOrdre={basculerOrdre}
            onSelect={select}
            onEffacerRecherche={effacerRecherche}
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
