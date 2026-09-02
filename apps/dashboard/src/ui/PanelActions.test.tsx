import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView } from '../domain/prospect.js';
import { PanelActions } from './PanelActions.js';

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

const avecTelephone = {
  ...base,
  enrichment: {
    status: 'ok' as const,
    phoneE164: '+33612345678',
    phoneKind: 'mobile' as const,
    rating: null,
    reviewCount: null,
    declaredUrl: null,
    matchedName: null,
    matchConfidence: null,
    enrichedAt: '2026-09-01T00:00:00Z',
  },
};

describe('PanelActions', () => {
  it('fait de l appel un lien tel: — le geste que l ecran sert', () => {
    renderWithPreferences(<PanelActions prospect={avecTelephone} />);
    const lien = screen.getByRole('link', { name: /Appeler/ });
    expect(lien.getAttribute('href')).toBe('tel:+33612345678');
  });

  it('n offre pas d appeler quand aucun numero n a ete collecte', () => {
    // Un bouton d'appel sans numero est une promesse creuse : on clique, rien
    // ne se passe, et rien ne dit pourquoi.
    renderWithPreferences(<PanelActions prospect={base} />);
    expect(screen.queryByRole('link', { name: /Appeler/ })).toBeNull();
    expect(screen.getByText(/Aucun numéro/)).toBeDefined();
  });

  it('ouvre le site en ligne sans laisser la page ouverte nous rediriger', () => {
    renderWithPreferences(
      <PanelActions
        prospect={{
          ...base,
          site: {
            repoUrl: null,
            deploymentUrl: 'https://x.vercel.app',
            promptVersion: null,
            model: null,
            generatedAt: null,
            publishedAt: '2026-09-01T00:00:00Z',
            unpublishedAt: null,
            contentRejectedAt: null,
            redaction: null,
          },
        }}
      />,
    );
    const lien = screen.getByRole('link', { name: /Voir le site/ });
    expect(lien.getAttribute('rel')).toContain('noopener');
  });

  it('annonce le redeploiement comme a venir plutot que d offrir un bouton inerte', () => {
    const { container } = renderWithPreferences(<PanelActions prospect={base} />);
    expect(screen.getByText('Bientôt')).toBeDefined();
    expect(container.querySelector('[aria-disabled="true"]')).not.toBeNull();
  });
});
