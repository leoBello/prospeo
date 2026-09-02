import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
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
});
