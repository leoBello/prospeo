import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SiteView } from '../domain/prospect.js';
import { renderWithPreferences } from '../test-utils.js';
import { SiteSection } from './SiteSection.js';

const SITE: SiteView = {
  repoUrl: 'https://github.com/prospeo/dos-services-51000900400035',
  deploymentUrl: 'https://dos-services-51000900400035.vercel.app',
  promptVersion: 'v3',
  model: 'claude-opus-4-8',
  generatedAt: '2026-09-01T20:00:00Z',
  publishedAt: '2026-09-01T20:17:31Z',
  unpublishedAt: null,
  contentRejectedAt: null,
  redaction: {
    accroche: 'Dépannage et installation sanitaire',
    presentation: 'Installé à Nantes depuis 2009.',
    prestations: ['Dépannage', 'Chauffe-eau'],
  },
};

describe('SiteSection', () => {
  it('dit qu’aucune rédaction n’existe, plutôt que de rester vide', () => {
    // Une section muette se lit comme un défaut d'affichage. Nommer l'étage qui
    // n'est pas passé dit du même coup quoi faire pour la remplir.
    renderWithPreferences(<SiteSection site={null} onRejeter={null} onAnnulerRejet={null} />);
    expect(screen.getByText(/generate/)).toBeTruthy();
  });

  it('n’affiche QUE ce que le modèle a décidé', () => {
    // Les faits sont ailleurs sur la fiche, tirés des mêmes colonnes. Les
    // répéter ici laisserait croire qu'il en existe deux versions, et noierait
    // la seule chose qu'un relecteur doit examiner : ce qui a pu être inventé.
    renderWithPreferences(<SiteSection site={SITE} onRejeter={null} onAnnulerRejet={null} />);

    expect(screen.getByText('Dépannage et installation sanitaire')).toBeTruthy();
    expect(screen.getByText('Dépannage · Chauffe-eau')).toBeTruthy();
    // Aucun téléphone, aucune note : ils ne sont pas passés par le modèle.
    expect(screen.queryByText(/06 02 00/)).toBeNull();
  });

  it('ouvre l’URL en ligne dans un onglet qui ne peut pas reprendre la main', async () => {
    // `noopener` : sans lui, la page ouverte garde une référence vers celle-ci
    // et peut la rediriger. La page visée est un site que NOUS avons déployé,
    // mais la règle ne se relâche pas selon la confiance qu'on s'accorde.
    renderWithPreferences(<SiteSection site={SITE} onRejeter={null} onAnnulerRejet={null} />);
    const lien = screen.getByRole('link', { name: SITE.deploymentUrl! });
    expect(lien.getAttribute('rel')).toContain('noopener');
  });

  it('distingue « publié » de « rédigé mais pas déployé »', () => {
    // Deux états que rien ne sépare à l'œil et qui appellent deux gestes
    // différents : republier, ou lancer `deploy`.
    const { unmount } = renderWithPreferences(
      <SiteSection
        site={{ ...SITE, deploymentUrl: null, publishedAt: null }}
        onRejeter={null}
        onAnnulerRejet={null}
      />,
    );
    expect(screen.getByText(/rien n’est encore publié/i)).toBeTruthy();
    unmount();

    renderWithPreferences(
      <SiteSection site={{ ...SITE, deploymentUrl: null }} onRejeter={null} onAnnulerRejet={null} />,
    );
    expect(screen.getByText(/déploiement pas encore abouti/i)).toBeTruthy();
  });

  it('rejette la rédaction, et annonce ce que le refus DÉCLENCHE', async () => {
    // Un bouton dont on ne voit pas l'effet est un bouton qu'on reclique. Le
    // refus n'efface rien à l'écran : il faut donc dire ce qu'il change —
    // `publish` s'y refuse désormais, `generate` en écrira une autre.
    const rejeter = vi.fn(async () => null);
    renderWithPreferences(
      <SiteSection site={SITE} onRejeter={rejeter} onAnnulerRejet={vi.fn(async () => null)} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /rejeter/i }));
    expect(rejeter).toHaveBeenCalledOnce();
  });

  it('propose d’ANNULER un refus, et non de le refaire', async () => {
    // Un refus est un clic, et un clic se fait par erreur. Sans le geste
    // inverse, revenir en arrière coûterait une régénération — donc un appel
    // payant pour défaire une maladresse.
    const annuler = vi.fn(async () => null);
    renderWithPreferences(
      <SiteSection
        site={{ ...SITE, contentRejectedAt: '2026-09-02T09:00:00Z' }}
        onRejeter={vi.fn(async () => null)}
        onAnnulerRejet={annuler}
      />,
    );

    expect(screen.queryByRole('button', { name: /^Rejeter/i })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /annuler le refus/i }));
    expect(annuler).toHaveBeenCalledOnce();
  });

  it('montre la rédaction refusée, au lieu de la cacher', () => {
    // C'est tout l'intérêt d'horodater plutôt que d'effacer : on doit pouvoir
    // relire CE QU'ON A REFUSÉ pour corriger le prompt, plutôt que de retirer
    // la même chose au hasard au tour suivant.
    renderWithPreferences(
      <SiteSection
        site={{ ...SITE, contentRejectedAt: '2026-09-02T09:00:00Z' }}
        onRejeter={null}
        onAnnulerRejet={null}
      />,
    );
    expect(screen.getByText('Dépannage et installation sanitaire')).toBeTruthy();
    expect(screen.getByText(/refusée le/i)).toBeTruthy();
  });

  it('affiche l’échec d’écriture plutôt que de l’avaler', async () => {
    // Une politique RLS refuse en silence côté PostgREST. Sans ce retour, le
    // relecteur croirait avoir rejeté, et `publish` publierait quand même.
    renderWithPreferences(
      <SiteSection
        site={SITE}
        onRejeter={async () => 'permission denied'}
        onAnnulerRejet={null}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /rejeter/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('permission denied');
  });

  it('n’affiche aucun bouton quand la fiche est en lecture seule', () => {
    renderWithPreferences(<SiteSection site={SITE} onRejeter={null} onAnnulerRejet={null} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
