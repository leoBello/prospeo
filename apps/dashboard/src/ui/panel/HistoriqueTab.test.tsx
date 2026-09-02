import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../../test-utils.js';
import type { ProspectView } from '../../domain/prospect.js';
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

describe('HistoriqueTab', () => {
  it('jalonne au moins la decouverte, qui est toujours connue', () => {
    renderWithPreferences(<HistoriqueTab prospect={base} />);
    expect(screen.getByText(/Découvert/)).toBeDefined();
  });

  it('reprend les dates que prospect_site porte reellement', () => {
    renderWithPreferences(
      <HistoriqueTab
        prospect={{
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
        }}
      />,
    );
    expect(screen.getByText(/Rédaction générée/)).toBeDefined();
    expect(screen.getByText(/Site publié/)).toBeDefined();
  });

  it('annonce le journal detaille comme a venir, en disant pourquoi', () => {
    // La maquette montre une frise pas-a-pas. Aucune table d'evenements
    // n'existe : la masquer ferait croire a un oubli, l'inventer serait pire.
    const { container } = renderWithPreferences(<HistoriqueTab prospect={base} />);
    expect(screen.getByText('Bientôt')).toBeDefined();
    expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
  });
});
