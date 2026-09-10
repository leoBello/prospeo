import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ProspectView } from '../domain/prospect.js';
import { RangeeVeille } from './RangeeVeille.js';
import { renderWithPreferences } from '../test-utils.js';

// Heure locale, sans « Z » : `joursCivils` lit `getFullYear`/`getMonth`/
// `getDate`, donc l'heure LOCALE de la machine qui exécute le test. Un
// horodatage UTC suffixé « Z » glisserait de jour civil selon le fuseau
// d'exécution (`Europe/Paris` ici, UTC+2 en septembre) et ferait échouer le
// calcul « trois jours » ci-dessous pour une raison qui n'a rien à voir avec
// le composant testé.
const MAINTENANT = new Date('2026-09-10T09:00:00');

function prospect(surcharges: Partial<ProspectView> = {}): ProspectView {
  return {
    id: 'p1',
    siret: '12345678900011',
    denomination: 'Aquatech Nantes',
    denominationUsuelle: null,
    tradeSlug: 'plombier',
    address: '1 rue des Olivettes',
    postalCode: '44000',
    city: 'Nantes',
    dateCreation: null,
    effectifCode: null,
    isClosed: false,
    discoveredAt: '2026-09-01T00:00:00.000Z',
    score: { total: 74, rulesetVersion: 'v3', computedAt: '2026-09-02T00:00:00.000Z', breakdown: [] },
    presence: null,
    enrichment: null,
    pipeline: null,
    site: null,
    messages: [],
    ...surcharges,
  };
}

describe('RangeeVeille — les absences, chacune nommée à sa façon', () => {
  it('distingue « jamais contacté » de « à contacter », dans le même onglet', () => {
    // Décision 1A : les deux populations partagent l'onglet, jamais le libellé.
    const { unmount } = renderWithPreferences(
      <RangeeVeille prospect={prospect({ pipeline: null })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('Jamais contacté')).toBeDefined();
    unmount();

    renderWithPreferences(
      <RangeeVeille
        prospect={prospect({ pipeline: { status: 'a_contacter', nextActionAt: null, updatedAt: '2026-09-02T00:00:00.000Z' } })}
        onglet="a_contacter"
        selectionne={false}
        now={MAINTENANT}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('À contacter')).toBeDefined();
    expect(screen.queryByText('Jamais contacté')).toBeNull();
  });

  it('nomme une présence web pas encore sondée, sans la confondre avec « aucune présence web »', () => {
    const { unmount } = renderWithPreferences(
      <RangeeVeille prospect={prospect({ presence: null })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    const badgeAbsente = screen.getByText('Présence web pas encore sondée');
    expect(badgeAbsente).toBeDefined();
    // Le texte seul ne suffit pas à prouver la distinction : une mutation qui
    // fige `discontinu` à `false` laisse ce texte intact et passait pourtant
    // inaperçue ici avant cet ajout — l'attribut que `Badge` pose sur SON
    // PROPRE nœud (`getByText` rend le `<span>` du badge, pas un ancêtre) est
    // la seule preuve du trait discontinu (voir `kit/Badge.tsx`). Un
    // `querySelector` sur tout le conteneur serait trompé par le badge « Site »
    // de la même rangée, discontinu lui aussi (colonne Site, prospect sans site).
    expect(badgeAbsente.getAttribute('data-discontinu')).toBe('true');
    unmount();

    renderWithPreferences(
      <RangeeVeille
        prospect={prospect({ presence: { category: 'none', finalUrl: null, httpStatus: null, domainAvailable: null, probedAt: '2026-09-02T00:00:00.000Z' } })}
        onglet="a_contacter"
        selectionne={false}
        now={MAINTENANT}
        onSelect={() => {}}
      />,
    );
    const badgeAucune = screen.getByText('Aucune présence web');
    expect(badgeAucune).toBeDefined();
    expect(badgeAucune.getAttribute('data-discontinu')).toBeNull();
  });

  it('dit quel étage n a pas produit le téléphone, plutôt que de laisser la case vide', () => {
    renderWithPreferences(
      <RangeeVeille prospect={prospect({ enrichment: null })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('aucune coordonnée')).toBeDefined();
    expect(screen.getByText('étage « enrich » non passé')).toBeDefined();
  });

  it('distingue le type de numéro, que le barème paye différemment', () => {
    renderWithPreferences(
      <RangeeVeille
        prospect={prospect({
          enrichment: {
            status: 'ok', phoneE164: '+33612440831', phoneKind: 'mobile', rating: null,
            reviewCount: null, declaredUrl: null, matchedName: null, matchConfidence: null,
            enrichedAt: '2026-09-02T00:00:00.000Z',
          },
        })}
        onglet="a_contacter"
        selectionne={false}
        now={MAINTENANT}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('mobile')).toBeDefined();
  });
});

describe('RangeeVeille — la colonne contextuelle', () => {
  const engage = (nextActionAt: string | null) =>
    prospect({ pipeline: { status: 'contacte', nextActionAt, updatedAt: '2026-09-08T00:00:00.000Z' } });

  it('porte l échéance dans les onglets d engagement, en dates civiles', () => {
    renderWithPreferences(
      // Même heure locale : voir la note sur `MAINTENANT`.
      <RangeeVeille prospect={engage('2026-09-07T23:00:00')} onglet="contacte" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    // Trois jours civils, pas deux tranches de 24 h et des poussières.
    expect(screen.getByText('en retard de 3 j')).toBeDefined();
  });

  it('nomme une échéance absente plutôt que d en inventer une', () => {
    renderWithPreferences(
      <RangeeVeille prospect={engage(null)} onglet="contacte" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('non datée')).toBeDefined();
  });

  it('porte le statut dans l onglet « toutes », le seul qui mélange les statuts', () => {
    renderWithPreferences(
      <RangeeVeille prospect={engage(null)} onglet="toutes" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('Contacté')).toBeDefined();
    expect(screen.queryByText('non datée')).toBeNull();
  });
});

describe('RangeeVeille — la sélection', () => {
  it('porte `aria-current`, la couleur ne suffisant jamais à dire un état', () => {
    renderWithPreferences(
      <RangeeVeille prospect={prospect()} onglet="a_contacter" selectionne now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('true');
  });

  it('prévient l appelant du prospect choisi', async () => {
    const onSelect = vi.fn();
    renderWithPreferences(
      <RangeeVeille prospect={prospect()} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={onSelect} />,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('p1');
  });
});
