import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../../test-utils.js';
import type { ProspectView } from '../../domain/prospect.js';
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

  it('dit l absence d enrichissement plutot que de montrer des champs vides', () => {
    renderWithPreferences(<FicheTab prospect={base} />);
    expect(screen.getByText(/étage « enrich »/)).toBeDefined();
  });
});
