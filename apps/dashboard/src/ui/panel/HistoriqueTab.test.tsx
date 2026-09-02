import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../../test-utils.js';
import type { ProspectView } from '../../domain/prospect.js';
import type { DeploymentEventView } from '../../domain/deployment.js';
import { HistoriqueTab } from './HistoriqueTab.js';

const base: ProspectView = {
  id: 'p1',
  siret: '81245678900023',
  denomination: 'PLOMBERIE GUERIN ET FILS',
  denominationUsuelle: 'Plomberie Guérin & Fils',
  tradeSlug: 'plombier',
  address: '14 rue des Olivettes',
  postalCode: '44000',
  city: 'Nantes',
  dateCreation: '2019-03-12',
  effectifCode: '11',
  isClosed: false,
  discoveredAt: '2026-08-30T00:00:00Z',
  score: null,
  presence: null,
  enrichment: null,
  pipeline: null,
  site: null,
  messages: [],
};

const prospectDeploye: ProspectView = {
  ...base,
  site: {
    repoUrl: 'https://github.com/prospeo/x',
    deploymentUrl: 'https://x.vercel.app',
    promptVersion: 'v4',
    model: 'claude-opus-5',
    generatedAt: '2026-09-01T14:18:00Z',
    publishedAt: '2026-09-01T14:22:00Z',
    unpublishedAt: null,
    contentRejectedAt: null,
    redaction: null,
  },
};

const evenementReussi: DeploymentEventView = {
  step: 'build',
  outcome: 'reussi',
  detail: null,
  durationMs: 92000,
  occurredAt: '2026-09-01T14:20:32Z',
};

const evenementEchoue: DeploymentEventView = {
  step: 'build',
  outcome: 'echoue',
  detail: 'Timeout Vercel après 300 s',
  durationMs: 300000,
  occurredAt: '2026-09-01T14:19:00Z',
};

/**
 * Le flot brouillon rapporté par le collector (§ docstring de
 * `HistoriqueTab`, finding 3 du relevé de revue) — les trois formes à la
 * fois, dans le désordre pour prouver que le composant trie lui-même :
 *
 * - deux `build/demarre` d'affilée, sans `reussi` intercalé (repli d'un run
 *   sur l'autre, une build encore en cours à la fin du run précédent) ;
 * - un `build/reussi` SANS `demarre` correspondant dans ce lot (démarré lors
 *   d'une exécution antérieure du collector) ;
 * - `projet` absent de tout le flot (le projet Vercel existait déjà).
 */
const flotBrouillon: DeploymentEventView[] = [
  {
    step: 'build',
    outcome: 'demarre',
    detail: null,
    durationMs: null,
    occurredAt: '2026-09-01T14:20:15Z',
  },
  {
    step: 'en_ligne',
    outcome: 'reussi',
    detail: null,
    durationMs: 1800,
    occurredAt: '2026-09-01T14:22:00Z',
  },
  {
    step: 'build',
    outcome: 'reussi',
    detail: null,
    durationMs: 41000,
    occurredAt: '2026-09-01T14:09:12Z',
  },
  {
    step: 'build',
    outcome: 'demarre',
    detail: null,
    durationMs: null,
    occurredAt: '2026-09-01T14:19:00Z',
  },
];

describe('HistoriqueTab', () => {
  it('jalonne au moins la decouverte, qui est toujours connue', () => {
    renderWithPreferences(<HistoriqueTab prospect={base} events={[]} />);
    expect(screen.getByText(/Découvert/)).toBeDefined();
  });

  it('reprend les dates que prospect_site porte reellement', () => {
    renderWithPreferences(<HistoriqueTab prospect={prospectDeploye} events={[]} />);
    expect(screen.getByText(/Rédaction générée/)).toBeDefined();
    expect(screen.getByText(/Site publié/)).toBeDefined();
  });

  it('affiche les evenements reels, avec etape, issue et duree', () => {
    renderWithPreferences(<HistoriqueTab prospect={prospectDeploye} events={[evenementReussi]} />);
    expect(screen.getByText('Build')).toBeDefined();
    expect(screen.getByText('Réussi')).toBeDefined();
    // 92000 ms = 1 min 32 s.
    expect(screen.getByText('1 m 32')).toBeDefined();
  });

  it('un echec affiche sa cause', () => {
    renderWithPreferences(<HistoriqueTab prospect={prospectDeploye} events={[evenementEchoue]} />);
    expect(screen.getByText('Échoué')).toBeDefined();
    expect(screen.getByText('Timeout Vercel après 300 s')).toBeDefined();
  });

  it('un prospect avec des jalons mais sans evenement affiche quand meme ses jalons', () => {
    // Le cas le plus frequent au jour un : vingt-deux sites deja en ligne,
    // aucun evenement, la table venant d'etre creee dans ce lot. Une frise
    // vide pour eux serait une regression par rapport a l'existant.
    renderWithPreferences(<HistoriqueTab prospect={prospectDeploye} events={[]} />);
    expect(screen.getByText(/Rédaction générée/)).toBeDefined();
    expect(screen.getByText(/Site publié/)).toBeDefined();
    // L'absence d'evenements se dit comme un fait date, pas comme un vide :
    // le dernier jalon connu (ici la publication, 01/09/2026) sert de repere.
    expect(screen.getByText('Le dernier fait connu pour ce site remonte au 01/09/2026.')).toBeDefined();
  });

  it('le marqueur Bientot a disparu de cet onglet', () => {
    const { container } = renderWithPreferences(<HistoriqueTab prospect={base} events={[]} />);
    expect(screen.queryByText('Bientôt')).toBeNull();
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });

  it('rend chaque evenement du flot brouillon independamment, trie chronologiquement', () => {
    // Le desordre du tableau d'entree est volontaire : voir le commentaire
    // de `flotBrouillon` plus haut. Si l'ordre de sortie recopiait l'ordre
    // d'entree, cette assertion echouerait.
    renderWithPreferences(<HistoriqueTab prospect={prospectDeploye} events={flotBrouillon} />);

    const lignes = screen.getAllByRole('listitem');
    expect(lignes).toHaveLength(4);

    // 1. Le "reussi" du build le plus ancien (14:09:12), sans "demarre" a lui
    //    dans ce flot.
    expect(within(lignes[0]!).getByText('Build')).toBeDefined();
    expect(within(lignes[0]!).getByText('Réussi')).toBeDefined();
    // 41000 ms = 41 s.
    expect(within(lignes[0]!).getByText('0 m 41')).toBeDefined();

    // 2 et 3. Les deux "demarre" du build, dans l'ordre de leurs horodatages
    //    (14:19:00 puis 14:20:15) — deux lignes distinctes, jamais fusionnees
    //    ni appariees avec un "reussi".
    expect(within(lignes[1]!).getByText('Build')).toBeDefined();
    expect(within(lignes[1]!).getByText('Démarré')).toBeDefined();
    expect(within(lignes[2]!).getByText('Build')).toBeDefined();
    expect(within(lignes[2]!).getByText('Démarré')).toBeDefined();

    // 4. La mise en ligne, la plus recente (14:22:00) — "Projet Vercel"
    //    n'apparait nulle part : le flot n'en porte aucun evenement.
    expect(within(lignes[3]!).getByText('Mise en ligne')).toBeDefined();
    expect(within(lignes[3]!).getByText('Réussi')).toBeDefined();
    // 1800 ms arrondi a 2 s.
    expect(within(lignes[3]!).getByText('0 m 02')).toBeDefined();

    expect(screen.getAllByText('Démarré')).toHaveLength(2);
    expect(screen.queryByText('Projet Vercel')).toBeNull();
  });

  it('un echec de lecture se distingue d un prospect sans evenement, et se rejoue', async () => {
    const user = userEvent.setup();
    const reessayer = vi.fn();
    renderWithPreferences(
      <HistoriqueTab
        prospect={prospectDeploye}
        events={[]}
        erreurEvenements="deployment_event : lecture impossible pour p1 — RLS"
        onReessayerEvenements={reessayer}
      />,
    );

    // Le vide date du cas "zero evenement" ne doit pas s'afficher : la panne
    // n'a rien a voir avec ce que ce prospect a reellement vecu.
    expect(screen.queryByText('Aucun événement enregistré')).toBeNull();

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Lecture impossible')).toBeDefined();
    expect(
      screen.getByText('deployment_event : lecture impossible pour p1 — RLS'),
    ).toBeDefined();

    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(reessayer).toHaveBeenCalledOnce();
  });

  it('un echec sans callback de relecture n affiche simplement aucun bouton', () => {
    renderWithPreferences(
      <HistoriqueTab prospect={prospectDeploye} events={[]} erreurEvenements="reseau indisponible" />,
    );
    expect(screen.getByText('Lecture impossible')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Réessayer' })).toBeNull();
  });
});
