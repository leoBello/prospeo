import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import type { DeploymentView } from '../domain/deployment.js';
import { DeploiementsScreen } from './DeploiementsScreen.js';

function deployment(id: string, patch: Partial<DeploymentView> = {}): DeploymentView {
  return {
    prospectId: id,
    nom: `Entreprise ${id}`,
    tradeSlug: 'plombier',
    city: 'NANTES',
    score: 80,
    gabarit: 'gabarit-agence-v2',
    etat: 'jamais',
    etapeCourante: null,
    detail: null,
    durationMs: null,
    deploymentUrl: null,
    publishedAt: null,
    unpublishedAt: null,
    peremptionDans: null,
    ...patch,
  };
}

function rendre(deployments: DeploymentView[]) {
  return renderWithPreferences(<DeploiementsScreen deployments={deployments} />);
}

describe('DeploiementsScreen', () => {
  it('rend le rail de navigation transmis, sans quoi il disparaitrait de l ecran', () => {
    renderWithPreferences(
      <DeploiementsScreen deployments={[]} nav={<div data-testid="rail-nav">rail</div>} />,
    );
    expect(screen.getByTestId('rail-nav')).toBeDefined();
  });

  it('rend les cinq etats du pipeline avec un libelle distinct chacun', () => {
    // Chaque ligne porte un nom unique : le filtre « Jamais déployé » porte
    // le meme texte que le badge d etat homonyme, et la recherche doit donc
    // se faire DANS la ligne, pas dans l ecran entier.
    rendre([
      deployment('a', { nom: 'Ligne jamais', etat: 'jamais', etapeCourante: null }),
      deployment('b', { nom: 'Ligne en cours', etat: 'en_cours', etapeCourante: 'build' }),
      deployment('c', {
        nom: 'Ligne echec',
        etat: 'echec',
        etapeCourante: 'build',
        detail: 'Le build a échoué.',
      }),
      deployment('d', {
        nom: 'Ligne en ligne',
        etat: 'en_ligne',
        etapeCourante: 'en_ligne',
        deploymentUrl: 'https://d.vercel.app',
        publishedAt: '2026-06-01T00:00:00Z',
      }),
      deployment('e', {
        nom: 'Ligne retire',
        etat: 'retire',
        etapeCourante: 'retrait',
        unpublishedAt: '2026-08-28T00:00:00Z',
      }),
    ]);
    const ligne = (nom: string): HTMLElement => {
      const trouvee = screen.getByText(nom).closest('li');
      if (trouvee === null) throw new Error(`ligne « ${nom} » introuvable`);
      return trouvee as HTMLElement;
    };
    expect(within(ligne('Ligne jamais')).getByText('Jamais déployé')).toBeDefined();
    expect(within(ligne('Ligne en cours')).getByText('Build en cours')).toBeDefined();
    expect(within(ligne('Ligne echec')).getByText('Build en échec')).toBeDefined();
    expect(within(ligne('Ligne en ligne')).getByText('En ligne')).toBeDefined();
    expect(within(ligne('Ligne retire')).getByText('Dépublié')).toBeDefined();
  });

  it('affiche la cause d une ligne en echec directement dans la ligne, sans avoir a ouvrir de journal', () => {
    const cause = 'Le build a échoué : contenu du site invalide, champ « prestations » vide';
    rendre([deployment('a', { nom: 'Chauffage Bellevue', etat: 'echec', etapeCourante: 'build', detail: cause })]);
    // Le texte exact de la cause doit etre visible sans aucune interaction.
    expect(screen.getByText(cause)).toBeDefined();
  });

  it('affiche un texte de repli quand la ligne en echec ne porte aucun detail', () => {
    rendre([deployment('a', { etat: 'echec', etapeCourante: 'build', detail: null })]);
    expect(screen.getByText('Le déploiement a échoué, sans détail enregistré.')).toBeDefined();
  });

  it('n affiche aucun lien vers l url d un site retire, meme quand l url est encore connue', () => {
    // Le docstring de `DeploymentEtat` le dit : `deployment_url` survit a la
    // depublication. Un lien laisserait croire que le site repond encore.
    rendre([
      deployment('a', {
        nom: 'Multi-Services Doulon',
        etat: 'retire',
        etapeCourante: 'retrait',
        deploymentUrl: 'https://multi-services-doulon.vercel.app',
        unpublishedAt: '2026-08-28T00:00:00Z',
      }),
    ]);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('hors ligne')).toBeDefined();
  });

  it('affiche un lien vers l url d un site en ligne', () => {
    rendre([
      deployment('a', {
        etat: 'en_ligne',
        etapeCourante: 'en_ligne',
        deploymentUrl: 'https://plomberie-guerin.vercel.app',
        publishedAt: '2026-06-01T00:00:00Z',
      }),
    ]);
    const lien = screen.getByRole('link');
    expect(lien.getAttribute('href')).toBe('https://plomberie-guerin.vercel.app');
  });

  it('affiche le compteur de peremption quand elle approche', () => {
    rendre([
      deployment('a', {
        etat: 'en_ligne',
        etapeCourante: 'en_ligne',
        deploymentUrl: 'https://a.vercel.app',
        publishedAt: '2026-06-01T00:00:00Z',
        peremptionDans: 3,
      }),
    ]);
    expect(screen.getByText('Péremption dans 3 j')).toBeDefined();
    // Le badge de peremption remplace le badge generique « En ligne » : c est
    // l indicateur de premier rang, pas un ajout a cote d un autre badge.
    expect(screen.queryByText('En ligne')).toBeNull();
  });

  it('n affiche aucun compteur de peremption quand elle est lointaine', () => {
    rendre([
      deployment('a', {
        etat: 'en_ligne',
        etapeCourante: 'en_ligne',
        deploymentUrl: 'https://a.vercel.app',
        publishedAt: '2026-06-01T00:00:00Z',
        peremptionDans: 45,
      }),
    ]);
    expect(screen.queryByText(/Péremption/)).toBeNull();
    expect(screen.getByText('En ligne')).toBeDefined();
  });

  it('rend le cas majoritaire du jour un : un site en ligne sans aucun evenement', () => {
    // 22 sites en ligne, zero ligne dans deployment_event : la table vient
    // d etre creee. L etape courante est nulle, la duree est nulle.
    rendre([
      deployment('a', {
        nom: 'Plomberie Guérin & Fils',
        etat: 'en_ligne',
        etapeCourante: null,
        detail: null,
        durationMs: null,
        deploymentUrl: 'https://plomberie-guerin.vercel.app',
        publishedAt: '2026-06-01T00:00:00Z',
        peremptionDans: 45,
      }),
    ]);
    expect(screen.getByText('Plomberie Guérin & Fils')).toBeDefined();
    expect(screen.getByText('En ligne')).toBeDefined();
    expect(screen.getByRole('link').getAttribute('href')).toBe('https://plomberie-guerin.vercel.app');
  });

  it('dit qu il n y a aucun deploiement, plutot que de rendre une page blanche', () => {
    rendre([]);
    expect(screen.getByText('Aucun déploiement')).toBeDefined();
  });

  it('dit qu aucun deploiement ne correspond au filtre courant', async () => {
    const utilisateur = userEvent.setup();
    rendre([deployment('a', { etat: 'en_ligne', etapeCourante: 'en_ligne', deploymentUrl: 'https://a.vercel.app' })]);
    await utilisateur.click(screen.getByRole('button', { name: /En échec/ }));
    expect(screen.getByText('Aucun déploiement dans ce filtre')).toBeDefined();
    // La ligne en ligne, elle, a disparu du rendu : le filtre a vraiment filtre.
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('revient a la liste complete en revenant sur le filtre Tous', async () => {
    const utilisateur = userEvent.setup();
    rendre([deployment('a', { etat: 'en_ligne', etapeCourante: 'en_ligne', deploymentUrl: 'https://a.vercel.app' })]);
    await utilisateur.click(screen.getByRole('button', { name: /En échec/ }));
    await utilisateur.click(screen.getByRole('button', { name: /^Tous/ }));
    expect(screen.getByRole('link')).toBeDefined();
  });

  it('affiche le gabarit actif pour chaque ligne', () => {
    rendre([deployment('a', { gabarit: 'gabarit-agence-v2' })]);
    expect(screen.getByText('gabarit-agence-v2')).toBeDefined();
  });

  it('nomme l absence de gabarit actif plutot que de laisser un vide', () => {
    rendre([deployment('a', { gabarit: null })]);
    expect(screen.getByText('aucun gabarit actif')).toBeDefined();
  });

  it('affiche le score du prospect, ou son absence nommee', () => {
    rendre([deployment('a', { score: 86 }), deployment('b', { score: null })]);
    expect(screen.getByText(/score 86/)).toBeDefined();
    expect(screen.getByText(/pas encore scoré/)).toBeDefined();
  });

  it('affiche la date de retrait d une ligne retiree', () => {
    rendre([
      deployment('a', {
        etat: 'retire',
        etapeCourante: 'retrait',
        unpublishedAt: '2026-08-28T10:00:00Z',
      }),
    ]);
    expect(screen.getByText(/Retiré le/)).toBeDefined();
  });

  it('compte les quatre chiffres de la bande d etat', () => {
    rendre([
      deployment('a', { etat: 'en_ligne', etapeCourante: 'en_ligne', deploymentUrl: 'https://a.vercel.app' }),
      deployment('b', { etat: 'en_ligne', etapeCourante: 'en_ligne', deploymentUrl: 'https://b.vercel.app' }),
      deployment('c', { etat: 'en_cours', etapeCourante: 'build' }),
      deployment('d', { etat: 'echec', etapeCourante: 'build', detail: 'x' }),
    ]);
    const bandeEnLigne = screen.getByText('en ligne').closest('div');
    expect(bandeEnLigne?.textContent).toContain('2');
    const bandeEnCours = screen.getByText('en cours').closest('div');
    expect(bandeEnCours?.textContent).toContain('1');
    const bandeEchec = screen.getByText('en échec').closest('div');
    expect(bandeEchec?.textContent).toContain('1');
  });
});
