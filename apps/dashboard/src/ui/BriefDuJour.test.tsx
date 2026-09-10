import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BriefDuJour } from './BriefDuJour.js';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView, WorkList } from '../domain/prospect.js';
import type { Jeu } from '../domain/jeu.js';
import type { JeuState } from '../data/useJeu.js';

/**
 * Sous ce jsdom (sans URL http(s) configurée), `window.localStorage` vaut
 * `undefined` — constaté par une sonde directe, pas supposé : l'avertissement
 * Node « localStorage is not available because --localstorage-file was not
 * provided » le confirme. `preferences.tsx` s'en accommode (son écriture
 * échoue en silence), mais ce test-ci doit vérifier une **vraie**
 * persistance d'un montage à l'autre : sans un magasin qui survit, le
 * troisième cas ne pourrait jamais être vert pour la bonne raison. Ce
 * palliatif reste local à ce fichier — il ne touche ni `test-setup.ts` ni la
 * configuration Vitest, qui gouvernent toute la suite.
 */
class MagasinMemoire {
  private valeurs = new Map<string, string>();
  clear(): void {
    this.valeurs.clear();
  }
  getItem(cle: string): string | null {
    return this.valeurs.has(cle) ? this.valeurs.get(cle)! : null;
  }
  setItem(cle: string, valeur: string): void {
    this.valeurs.set(cle, valeur);
  }
}

beforeAll(() => {
  Object.defineProperty(window, 'localStorage', {
    value: new MagasinMemoire(),
    writable: true,
    configurable: true,
  });
});

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

  it('est déplié par défaut : on ne cache pas ce qui est dû à la première visite', () => {
    renderWithPreferences(<BriefDuJour {...props} />);
    expect(screen.getByRole('button', { name: 'Replier le brief' })).toBeDefined();
  });

  it('se replie en un résumé, qui compte encore ce qui est dû', async () => {
    renderWithPreferences(<BriefDuJour {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Replier le brief' }));
    expect(screen.getByText('Brief du jour')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Déplier' })).toBeDefined();
  });

  it('retient le repli d une visite à l autre', async () => {
    const { unmount } = renderWithPreferences(<BriefDuJour {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Replier le brief' }));
    unmount();

    renderWithPreferences(<BriefDuJour {...props} />);
    expect(screen.getByRole('button', { name: 'Déplier' })).toBeDefined();
  });

  it('distingue, dans le résumé replié, les relances en retard de celles qui ne le sont pas encore', async () => {
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

    renderWithPreferences(<BriefDuJour {...props} relances={relances} />);
    await userEvent.click(screen.getByRole('button', { name: 'Replier le brief' }));

    expect(screen.getByText('2 relances dues, dont 1 en retard')).toBeDefined();
  });

  /**
   * Divergence maquette/plan (voir `BriefDuJour.tsx`) : `VeilleCompacte.dc.html`
   * montre « Objectif pas encore connu » sur la ligne repliée, le pseudo-code
   * du plan l'omettait. C'est le cas RÉEL des données au 10 septembre 2026
   * (`historique_insuffisant` : la table `pipeline_event` vient d'être créée)
   * — l'absence se nomme, jamais elle ne se vide ni ne se rend par un zéro.
   */
  it('nomme l objectif inconnu dans le résumé replié, plutôt que de le taire ou de le rendre par un zéro', async () => {
    // `container.textContent`, et non `getByText` : « pas encore » vit dans
    // un `<span>` imbriqué (`styles.absent`), et `getByText` ne compare que
    // le texte des nœuds ENFANTS DIRECTS d'un élément — un des pièges
    // documentés de cette suite.
    const jeu = jeuPret({ objectifDuJour: { connue: false, motif: 'historique_insuffisant' } });
    const { container } = renderWithPreferences(<BriefDuJour {...props} jeu={jeu} />);
    await userEvent.click(screen.getByRole('button', { name: 'Replier le brief' }));

    expect(container.textContent).toContain('Objectif du jour pas encore');
  });

  it('reprend, dans le résumé replié, le réalisé et son dénominateur — les mêmes chiffres que l anneau de BandeProgression', async () => {
    const jeu = jeuPret({ objectifDuJour: { connue: true, valeur: 15 }, realiseAujourdHui: 12 });
    renderWithPreferences(<BriefDuJour {...props} jeu={jeu} />);
    await userEvent.click(screen.getByRole('button', { name: 'Replier le brief' }));

    expect(screen.getByText('Objectif du jour 12 / 15')).toBeDefined();
  });

  it('ne prétend rien sur l objectif tant que le jeu charge : aucun résumé ne serait honnête', async () => {
    renderWithPreferences(<BriefDuJour {...props} jeu={{ status: 'loading' }} />);
    await userEvent.click(screen.getByRole('button', { name: 'Replier le brief' }));

    expect(screen.queryByText('Objectif du jour', { exact: false })).toBeNull();
  });
});
