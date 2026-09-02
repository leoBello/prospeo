import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView } from '../domain/prospect.js';
import { ProspectPanel } from './ProspectPanel.js';

const prospect = (patch: Partial<ProspectView> = {}): ProspectView => ({
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
  pipeline: { status: 'relance', nextActionAt: '2026-09-02', updatedAt: '2026-09-01T00:00:00Z' },
  site: null,
  messages: [],
  ...patch,
});

describe('ProspectPanel', () => {
  it('affiche le nom d usage plutot que la denomination legale', () => {
    // « PLOMBERIE GUERIN ET FILS » est ce que dit l'INSEE ; l'enseigne est ce
    // que dira l'interlocuteur au telephone.
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    expect(screen.getByRole('heading', { name: 'Plomberie Guérin & Fils' })).toBeDefined();
  });

  it('n ouvre qu un onglet a la fois — c est tout l objet de la refonte', async () => {
    // La preuve doit porter sur un texte propre au contenu de chaque onglet,
    // pas sur un role="heading" que l'onglet visé ne rend pas (Historique n'en
    // a pas) ni sur un texte présent de toute façon (SIRET, avant tout clic,
    // puisque Fiche est l'onglet actif par défaut dans les deux versions du
    // composant — correcte ou régressée).
    //
    // Les deux assertions `queryByRole` ci-dessous NE DÉTECTENT PAS une
    // régression `keepMounted` : Base UI pose l'attribut `hidden` sur tout
    // panneau inactif qu'il soit monté ou non, et `queryByRole` filtre par
    // défaut (`hidden: false`) tout élément portant cet attribut. Elles
    // rendent donc `null` que le panneau soit réellement absent du DOM ou
    // simplement masqué-mais-monté : elles ne distinguent pas les deux cas.
    // Elles restent utiles contre une AUTRE régression — un retour à des
    // `<div>` empilées sans `hidden` du tout, qu'elles détecteraient bien.
    //
    // Seule l'assertion `queryByText('Découvert en base')` ci-dessous
    // discrimine réellement : `queryByText` ne filtre pas sur `hidden`, donc
    // un panneau Historique monté-mais-caché serait quand même trouvé, et
    // l'assertion `toBeNull()` échouerait comme voulu.
    const user = userEvent.setup();
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );

    // Avant tout clic, seul l'onglet Fiche (actif par défaut) est monté : le
    // contenu des trois autres ne doit pas exister dans le DOM.
    expect(screen.queryByRole('heading', { name: 'Site généré' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Messages de vente' })).toBeNull();
    // `histo.discovered`, rendu sans condition par `HistoriqueTab` — contrairement
    // à `histo.detail.title` (« Journal détaillé des étapes »), affiché par
    // un `Bientot` provisoire promis à disparaître dès la table des
    // événements de déploiement livrée (§ finding 2 du rapport de revue).
    expect(screen.queryByText('Découvert en base')).toBeNull();

    await user.click(screen.getByRole('tab', { name: /Site/ }));
    expect(screen.getByRole('heading', { name: 'Site généré' })).toBeDefined();
    // Absence après bascule : le SIRET, propre à Fiche, ne doit plus se
    // trouver nulle part dans le DOM une fois qu'on l'a quitté. Une
    // régression où les onglets visités s'accumulent laisserait ce texte en
    // place et ferait échouer cette ligne.
    expect(screen.queryByText('81245678900023')).toBeNull();

    await user.click(screen.getByRole('tab', { name: /Messages/ }));
    expect(screen.getByRole('heading', { name: 'Messages de vente' })).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Site généré' })).toBeNull();

    await user.click(screen.getByRole('tab', { name: /Historique/ }));
    expect(screen.getByText('Découvert en base')).toBeDefined();
    expect(screen.queryByRole('heading', { name: 'Messages de vente' })).toBeNull();
  });

  it('bascule d onglet au clic', async () => {
    const user = userEvent.setup();
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    await user.click(screen.getByRole('tab', { name: /Site/ }));
    expect(await screen.findByText(/étage « generate »/)).toBeDefined();
  });

  it('bascule d onglet aux fleches, sans souris', async () => {
    // La navigation clavier d'un jeu d'onglets est une norme ARIA, pas un
    // confort : c'est Base UI qui la fournit, et ce test verifie qu'elle est
    // bien cablee.
    const user = userEvent.setup();
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    await user.click(screen.getByRole('tab', { name: /Fiche/ }));
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Site/ })).toHaveProperty('tabIndex', 0);
  });

  it('affiche le libelle du metier, et non son slug de catalogue', () => {
    // `tradeSlug` est une cle de `trades.ts` — un identifiant de code, pas un
    // mot d'interface. `Trade.label` existe precisement pour cet usage.
    renderWithPreferences(
      <ProspectPanel prospect={prospect()} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    expect(screen.getByText('Plombier')).toBeDefined();
    expect(screen.queryByText('plombier')).toBeNull();
  });

  it('se rabat sur le slug quand le metier est absent du catalogue', () => {
    // Un metier decouvert en base sans entree dans `trades.ts` ne doit pas
    // rendre un badge vide : un identifiant lisible est encore une
    // information, une pastille muette n'en est plus une.
    renderWithPreferences(
      <ProspectPanel
        prospect={prospect({ tradeSlug: 'couvreur' })}
        position={null}
        currentRulesetVersion="v3"
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('couvreur')).toBeDefined();
  });

  it('rend une invite quand aucun prospect n est choisi', () => {
    renderWithPreferences(
      <ProspectPanel prospect={null} position={null} currentRulesetVersion="v3" onClose={() => {}} />,
    );
    expect(screen.getByText(/Choisir un prospect/)).toBeDefined();
  });
});
