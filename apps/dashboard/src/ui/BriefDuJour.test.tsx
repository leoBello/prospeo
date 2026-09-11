import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { BriefDuJour } from './BriefDuJour.js';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView, WorkList } from '../domain/prospect.js';
import type { Jeu } from '../domain/jeu.js';
import type { JeuState } from '../data/useJeu.js';

const RELANCES = {
  items: [],
  totalCount: 0,
};

// Même idiome que `WorkListSection.test.tsx` : un prospect minimal, patché
// au besoin — pas une seconde fabrique inventée pour ce fichier.
function prospect(patch: Partial<ProspectView> = {}): ProspectView {
  return {
    id: 'p1',
    siret: '11111111100001',
    denomination: 'ENTREPRISE TEST',
    denominationUsuelle: null,
    tradeSlug: 'plombier',
    address: '5 RUE LE NOTRE 44000 NANTES',
    postalCode: '44000',
    city: 'NANTES',
    dateCreation: '2012-12-15',
    effectifCode: '02',
    isClosed: false,
    discoveredAt: '2026-09-01T01:38:07Z',
    score: null,
    presence: null,
    enrichment: null,
    pipeline: null,
    site: null,
    messages: [],
    ...patch,
  };
}

/**
 * `Jeu` prêt par défaut — même patron que `jeuPret` dans
 * `BandeProgression.test.tsx`, réécrit ici plutôt qu'importé : un fichier de
 * test n'exporte rien, l'importer exécuterait ses `describe` une seconde
 * fois (voir le docstring d'`ATTENTE_SURVOL`, `test-utils.tsx`).
 */
function jeuPret(overrides: Partial<Jeu> = {}): JeuState {
  const defaut: Jeu = {
    objectifDuJour: { connue: true, valeur: 15 },
    realiseAujourdHui: 12,
    serie: { jours: 6, borneAtteinte: false },
    palier: { points: 340, seuil: 500, numero: 1, progression: 340, complet: true },
    badges: [
      { id: 'premiere_relance_tenue', etat: 'obtenu' },
      { id: 'premier_site_en_ligne', etat: 'verrouille' },
      { id: 'premier_rendez_vous', etat: 'verrouille' },
      { id: 'serie_sept_jours', etat: 'verrouille' },
    ],
    ...overrides,
  };
  return { status: 'ready', jeu: defaut };
}

const props = {
  // `'idle'` n'existe pas dans `JeuState` (data/useJeu.ts) : `'loading'` est
  // l'état le plus pauvre que le type accepte réellement, sans coercition.
  jeu: { status: 'loading' as const },
  relances: RELANCES,
  selectedId: null,
  currentRulesetVersion: 'v3',
  emptyKey: 'today.empty.followUps' as const,
  now: new Date('2026-09-10T09:00:00.000'),
  onSelect: () => {},
};

describe('BriefDuJour', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  // Correctif de revue (constat 4) : le bouton « Replier le brief » a
  // déménagé sur la ligne de titre de `TodayScreen` (la maquette le pose sur
  // la ligne « Aujourd'hui », jamais dans sa propre rangée). Ce fichier ne
  // teste donc plus ce bouton — il n'appartient plus à `BriefDuJour` — mais
  // continue de tester CE que ce composant rend encore lui-même : le corps
  // déplié, et le résumé replié avec son bouton « Déplier » (resté ici, la
  // maquette `VeilleCompacte.dc.html` le laissant dans la barre de résumé).
  // Le câblage du bouton déménagé est couvert par `TodayScreen.test.tsx`.
  it('est déplié par défaut : on ne cache pas ce qui est dû à la première visite', () => {
    renderWithPreferences(<BriefDuJour {...props} />);
    // Le résumé replié (et son bouton « Déplier ») n'existe que dans l'AUTRE
    // branche du rendu : son absence prouve l'état déplié par défaut.
    expect(screen.queryByRole('button', { name: 'Déplier' })).toBeNull();
    // La bande de progression, elle, ne se monte que déplié.
    expect(screen.getByRole('status')).toBeDefined();
  });

  it('affiche le résumé replié, qui compte encore ce qui est dû, quand la préférence de repli est active', () => {
    // Plus de clic ICI sur un bouton de repli : il a déménagé (constat 4).
    // On simule directement une préférence déjà repliée, comme le ferait une
    // visite suivante — `setBriefReplie` (ui/preferences.tsx) écrit à cette
    // même clé.
    window.localStorage.setItem('prospeo.briefReplie', 'true');
    renderWithPreferences(<BriefDuJour {...props} />);
    expect(screen.getByText('Brief du jour')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Déplier' })).toBeDefined();
  });

  it('retient le dépli d une visite à l autre', async () => {
    window.localStorage.setItem('prospeo.briefReplie', 'true');
    const { unmount } = renderWithPreferences(<BriefDuJour {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Déplier' }));
    unmount();

    renderWithPreferences(<BriefDuJour {...props} />);
    // Remonté déplié : le résumé et son bouton « Déplier » ont disparu.
    expect(screen.queryByRole('button', { name: 'Déplier' })).toBeNull();
  });

  it('donne une classe au bouton « Déplier », pas le bouton nu du navigateur (constat de revue 5)', () => {
    // `ui/theme.css` ne pose que `font`, `color` et `cursor` sur `button` :
    // sans classe, ce bouton affiche le fond gris et la bordure 3D du
    // navigateur — invisible pour `jsdom`, mais bien réel à l'écran.
    window.localStorage.setItem('prospeo.briefReplie', 'true');
    renderWithPreferences(<BriefDuJour {...props} />);
    expect(screen.getByRole('button', { name: 'Déplier' }).className).not.toBe('');
  });

  it('distingue, dans le résumé replié, les relances en retard de celles qui ne le sont pas encore', () => {
    // Une échéance passée (8 septembre) et une échéance future (12 septembre),
    // par rapport à `props.now` (10 septembre) : une seule est en retard.
    const relances: WorkList = {
      items: [
        {
          prospect: prospect({
            id: 'en-retard',
            pipeline: { status: 'relance', nextActionAt: '2026-09-08T10:00:00.000', updatedAt: '2026-09-01T00:00:00.000' },
          }),
          reason: [],
        },
        {
          prospect: prospect({
            id: 'pas-encore-due',
            pipeline: { status: 'relance', nextActionAt: '2026-09-12T10:00:00.000', updatedAt: '2026-09-01T00:00:00.000' },
          }),
          reason: [],
        },
      ],
      totalCount: 2,
    };

    window.localStorage.setItem('prospeo.briefReplie', 'true');
    renderWithPreferences(<BriefDuJour {...props} relances={relances} />);

    expect(screen.getByText('2 relances dues, dont 1 en retard')).toBeDefined();
  });

  /**
   * Divergence maquette/plan (voir `BriefDuJour.tsx`) : `VeilleCompacte.dc.html`
   * montre « Objectif pas encore connu » sur la ligne repliée, le pseudo-code
   * du plan l'omettait. C'est le cas RÉEL des données au 10 septembre 2026
   * (`historique_insuffisant` : la table `pipeline_event` vient d'être créée)
   * — l'absence se nomme, jamais elle ne se vide ni ne se rend par un zéro.
   *
   * Le texte attendu vient de `jeu.objectif.titre` + `veille.brief.objectif.inconnu`
   * (`fr.ts`) — pas de `jeu.objectif.denominateur.inconnu` (« pas encore »
   * seul) : cette dernière est taillée pour l'anneau de `BandeProgression`,
   * pas pour finir une phrase (correctif de revue, tâche 8).
   */
  it('nomme l objectif inconnu dans le résumé replié, plutôt que de le taire ou de le rendre par un zéro', () => {
    // `container.textContent`, et non `getByText` : « pas encore connu » vit
    // dans un `<span>` imbriqué (`styles.absent`), et `getByText` ne compare
    // que le texte des nœuds ENFANTS DIRECTS d'un élément — un des pièges
    // documentés de cette suite.
    const jeu = jeuPret({ objectifDuJour: { connue: false, motif: 'historique_insuffisant' } });
    window.localStorage.setItem('prospeo.briefReplie', 'true');
    const { container } = renderWithPreferences(<BriefDuJour {...props} jeu={jeu} />);

    expect(container.textContent).toContain('Objectif du jour pas encore connu');
  });

  it('reprend, dans le résumé replié, le réalisé et son dénominateur — les mêmes chiffres que l anneau de BandeProgression', () => {
    const jeu = jeuPret({ objectifDuJour: { connue: true, valeur: 15 }, realiseAujourdHui: 12 });
    window.localStorage.setItem('prospeo.briefReplie', 'true');
    renderWithPreferences(<BriefDuJour {...props} jeu={jeu} />);

    expect(screen.getByText('Objectif du jour 12 / 15')).toBeDefined();
  });

  it('ne prétend rien sur l objectif tant que le jeu charge : aucun résumé ne serait honnête', () => {
    window.localStorage.setItem('prospeo.briefReplie', 'true');
    renderWithPreferences(<BriefDuJour {...props} jeu={{ status: 'loading' }} />);

    expect(screen.queryByText('Objectif du jour', { exact: false })).toBeNull();
  });
});
