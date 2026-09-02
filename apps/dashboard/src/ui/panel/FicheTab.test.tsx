import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import type { Enums } from '@prospeo/db';
import type { WebPresenceCategory } from '@prospeo/core';
import { renderWithPreferences } from '../../test-utils.js';
import type { EnrichmentView, ProspectView } from '../../domain/prospect.js';
import { FicheTab } from './FicheTab.js';

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

describe('FicheTab', () => {
  it('affiche les faits d identite', () => {
    renderWithPreferences(<FicheTab prospect={base} />);
    expect(screen.getByText('81245678900023')).toBeDefined();
    expect(screen.getByText(/rue des Olivettes/)).toBeDefined();
  });

  it('n invente pas un effectif quand l INSEE n en publie pas', () => {
    // `minHeadcount` rend null pour « unite non employeuse » et « inconnu ».
    // Afficher « 0 salarie » inventerait un fait que la source ne donne pas.
    //
    // `queryByText('0 salarié')` seul ne prouve rien : le rendu reel prefixe
    // toujours d'« au moins » (`unit.employees` / `unit.employees_one`), et
    // la recherche de Testing Library est exacte sur le noeud entier — donc
    // aucune chaine ne matche jamais, que la garde nulle soit correcte ou
    // remplacee par un `?? 0`. On pingle les deux moities de la propriete :
    // aucun texte contenant un nombre n'apparait dans le champ effectif, et
    // le texte nomme de l'absence (`value.unknown`) apparait bien a la place.
    renderWithPreferences(<FicheTab prospect={{ ...base, effectifCode: 'NN' }} />);
    expect(screen.queryByText(/salarié/)).toBeNull();
    expect(screen.getByText('non renseigné')).toBeDefined();
  });

  it('distingue « pas encore collecte » de « non publie par la source »', () => {
    // C'est un acquis du chantier 1 : les deux absences ne se valent pas. Un
    // tiret unique les confondrait, et on relancerait un enrichissement qui
    // ne peut rien rapporter.
    renderWithPreferences(
      <FicheTab
        prospect={{
          ...base,
          enrichment: {
            status: 'ok',
            phoneE164: '+33612345678',
            phoneKind: 'mobile',
            rating: 4.6,
            reviewCount: null,
            declaredUrl: null,
            matchedName: 'Plomberie Guérin',
            matchConfidence: 0.94,
            enrichedAt: '2026-09-01T00:00:00Z',
          },
        }}
      />,
    );
    expect(screen.getByText('non publié par la source')).toBeDefined();
    // NOTE (déviation documentée dans task-8-report.md) : le brief écrivait
    // ici « non collecté », qui ne correspond à aucun texte réellement rendu.
    // La clé `value.notCollected` existante — et la doctrine du chantier 1,
    // citée mot pour mot dans le commentaire ci-dessus — disent « pas encore
    // collecté ». On aligne le test sur le texte établi plutôt que d'inventer
    // une variante ou de redéfinir la clé.
    expect(screen.getByText('pas encore collecté')).toBeDefined();
  });

  // Le barème paie 20 points un mobile contre 10 un fixe. Sans le
  // qualificatif à l'écran, le panneau affichait un score bâti sur une
  // distinction qu'il refusait de montrer — sur le seul écran dont l'action
  // principale est un `tel:`.
  const avecTelephone = (phoneKind: EnrichmentView['phoneKind']): EnrichmentView => ({
    status: 'ok',
    phoneE164: '+33612345678',
    phoneKind,
    rating: null,
    reviewCount: null,
    declaredUrl: null,
    matchedName: null,
    matchConfidence: null,
    enrichedAt: '2026-09-01T00:00:00Z',
  });

  it('qualifie le numero de mobile, a cote du numero', () => {
    renderWithPreferences(
      <FicheTab prospect={{ ...base, enrichment: avecTelephone('mobile') }} />,
    );
    expect(screen.getByText('+33612345678')).toBeDefined();
    expect(screen.getByText('mobile')).toBeDefined();
    expect(screen.queryByText('fixe')).toBeNull();
  });

  it('qualifie le numero de fixe, avec un texte distinct de celui du mobile', () => {
    renderWithPreferences(
      <FicheTab prospect={{ ...base, enrichment: avecTelephone('landline') }} />,
    );
    expect(screen.getByText('+33612345678')).toBeDefined();
    expect(screen.getByText('fixe')).toBeDefined();
    expect(screen.queryByText('mobile')).toBeNull();
  });

  it('n etiquette pas un numero dont le type n a pas ete tranche', () => {
    // `phoneKind` nul veut dire « type inconnu ». Le ranger d'office en fixe
    // (ou en mobile) inventerait un fait, et ferait mentir les dix points
    // d'écart du barème.
    renderWithPreferences(
      <FicheTab prospect={{ ...base, enrichment: avecTelephone(null) }} />,
    );
    expect(screen.getByText('+33612345678')).toBeDefined();
    expect(screen.queryByText('mobile')).toBeNull();
    expect(screen.queryByText('fixe')).toBeNull();
  });

  it('dit l absence d enrichissement plutot que de montrer des champs vides', () => {
    renderWithPreferences(<FicheTab prospect={base} />);
    expect(screen.getByText(/étage « enrich »/)).toBeDefined();
  });

  // Finding 1 : le statut d'enrichissement (`ok` / `not_found` / `ambiguous` /
  // `blocked`) avait disparu avec la refonte, et un prospect bloqué par
  // Google se lisait exactement comme un prospect jamais enrichi. Les
  // quatre statuts doivent rendre un texte distinct de l'absence, et
  // distincts entre eux.
  const statutsEnrichissement: { status: Enums<'enrichment_status'>; texte: string }[] = [
    { status: 'ok', texte: 'Fiche Google appariée' },
    { status: 'not_found', texte: 'Aucune fiche Google trouvée' },
    { status: 'ambiguous', texte: 'Appariement à trancher' },
    { status: 'blocked', texte: 'Enrichissement bloqué par Google' },
  ];

  const enrichissement = (status: Enums<'enrichment_status'>): EnrichmentView => ({
    status,
    phoneE164: null,
    phoneKind: null,
    rating: null,
    reviewCount: null,
    declaredUrl: null,
    matchedName: null,
    matchConfidence: null,
    enrichedAt: '2026-09-01T00:00:00Z',
  });

  it.each(statutsEnrichissement)(
    'rend le statut d enrichissement « $status » avec un texte qui lui est propre',
    ({ status, texte }) => {
      renderWithPreferences(
        <FicheTab prospect={{ ...base, enrichment: enrichissement(status) }} />,
      );
      // Le texte du statut est visible...
      expect(screen.getByText(texte)).toBeDefined();
      // ...et distinct du texte d'absence totale d'enrichissement : un
      // prospect bloqué n'est pas un prospect jamais enrichi.
      expect(screen.queryByText(/étage « enrich »/)).toBeNull();
    },
  );

  it('distingue le telephone jamais collecte du telephone bloque par la source', () => {
    // Sans le statut visible, les deux cas rendaient le meme "pas encore
    // collecté" pour le champ téléphone : c'est exactement la confusion
    // que la doctrine du dépôt interdit.
    renderWithPreferences(
      <FicheTab prospect={{ ...base, enrichment: enrichissement('blocked') }} />,
    );
    expect(screen.getByText('Enrichissement bloqué par Google')).toBeDefined();
    // Plusieurs champs (téléphone, site déclaré, nom apparié) partagent ce
    // texte d'absence : `getAllByText` plutôt que `getByText`, qui échouerait
    // sur la multiplicité au lieu de prouver la coexistence des deux faits.
    expect(screen.getAllByText('pas encore collecté').length).toBeGreaterThan(0);
  });

  // Finding 1 : la présence web (le motif de qualification) avait disparu
  // sans destination. Chaque catégorie doit rendre son propre texte, et
  // l'état « sondé mais non classé » (`category: null`) doit se distinguer
  // en code de l'absence totale de ligne, même si les deux rendent le même
  // texte faute d'état intermédiaire à afficher (`PresenceView.category`,
  // dans `domain/prospect.ts`).
  const categoriesPresence: { category: WebPresenceCategory; texte: string }[] = [
    { category: 'none', texte: 'Aucune présence web' },
    { category: 'social_only', texte: 'Page sociale, aucun site' },
    { category: 'directory_only', texte: 'Fiche annuaire uniquement' },
    { category: 'dead_site', texte: 'Site en panne ou obsolète' },
    { category: 'has_site', texte: 'Site correct et vivant' },
  ];

  it.each(categoriesPresence)('rend la categorie de presence « $category »', ({ category, texte }) => {
    renderWithPreferences(
      <FicheTab
        prospect={{
          ...base,
          presence: {
            category,
            finalUrl: null,
            httpStatus: null,
            domainAvailable: null,
            probedAt: '2026-09-01T00:00:00Z',
          },
        }}
      />,
    );
    expect(screen.getByText(texte)).toBeDefined();
  });

  it('rend la meme absence pour une presence sondee non classee et pour aucune ligne', () => {
    // `probe` a tourné, `classify` pas encore : `category` est `null` sans
    // que la ligne elle-même soit absente. C'est un état réel, distinct
    // d'un prospect jamais sondé, même si l'écran n'a pas (encore) de texte
    // dédié pour l'un et pas l'autre.
    const { unmount } = renderWithPreferences(
      <FicheTab
        prospect={{
          ...base,
          presence: {
            category: null,
            finalUrl: null,
            httpStatus: null,
            domainAvailable: null,
            probedAt: '2026-09-01T00:00:00Z',
          },
        }}
      />,
    );
    expect(screen.getByText('Présence web pas encore sondée')).toBeDefined();
    unmount();

    renderWithPreferences(<FicheTab prospect={base} />);
    expect(screen.getByText('Présence web pas encore sondée')).toBeDefined();
  });
});
