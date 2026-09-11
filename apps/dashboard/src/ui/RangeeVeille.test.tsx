import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ScoreLine } from '@prospeo/core';
import type { ProspectView } from '../domain/prospect.js';
import { RangeeVeille } from './RangeeVeille.js';
import { renderWithPreferences } from '../test-utils.js';

function score(total: number, breakdown: ScoreLine[] = []) {
  return { total, rulesetVersion: 'v3', computedAt: '2026-09-02T00:00:00.000Z', breakdown };
}

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

  it('affiche le numéro sous la forme qu on lit et qu on compose, jamais en E.164', () => {
    // La colonne sert à APPELER. `+33612440831` est du format machine : il ne
    // se lit pas à voix haute et ne se compose pas. Le défaut n'a été vu qu'au
    // navigateur — aucun test ne regardait le texte du numéro.
    renderWithPreferences(
      <RangeeVeille
        prospect={prospect({
          enrichment: {
            status: 'ok', phoneE164: '+33612440831', phoneKind: 'mobile', rating: null,
            reviewCount: null, declaredUrl: null, matchedName: null, matchConfidence: null,
            enrichedAt: '2026-09-02T00:00:00.000',
          },
        })}
        onglet="a_contacter"
        selectionne={false}
        now={MAINTENANT}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('06 12 44 08 31')).toBeDefined();
    expect(screen.queryByText('+33612440831')).toBeNull();
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

  it('nomme le jour même, distinct du retard et de l échéance à venir', () => {
    // Même jour civil que MAINTENANT (09 h locale) : 08 h locale, le 10.
    renderWithPreferences(
      <RangeeVeille prospect={engage('2026-09-10T08:00:00')} onglet="contacte" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('aujourd’hui')).toBeDefined();
  });

  it('porte une échéance à venir, distincte du retard', () => {
    // Cinq jours civils après MAINTENANT (le 10) : le 15, heure locale.
    renderWithPreferences(
      <RangeeVeille prospect={engage('2026-09-15T08:00:00')} onglet="contacte" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('dans 5 j')).toBeDefined();
  });

  it('ne rend jamais « NaN » pour une chaîne de date invalide, et la traite comme non datée', () => {
    const { container } = renderWithPreferences(
      <RangeeVeille prospect={engage('pas-une-date')} onglet="contacte" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('non datée')).toBeDefined();
    // Sur le texte du conteneur entier, et non sur `queryByText(/NaN/)` : ce
    // dernier passerait aussi sur un écran vide, où aucun nœud ne porte la
    // chaîne « NaN » faute d'avoir été rendu du tout. Ici, la rangée EST
    // rendue, avec sa colonne contextuelle garnie ; c'est ce texte-là qu'on
    // veut prouver exempt de « NaN ».
    expect(container.textContent).not.toMatch(/NaN/);
  });

  it('porte le statut dans l onglet « toutes », le seul qui mélange les statuts', () => {
    renderWithPreferences(
      <RangeeVeille prospect={engage(null)} onglet="toutes" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('Contacté')).toBeDefined();
    expect(screen.queryByText('non datée')).toBeNull();
  });

  it('porte « Depuis » dans les onglets fermés, en jours civils depuis la dernière mise à jour', () => {
    const clos = prospect({ pipeline: { status: 'gagne', nextActionAt: null, updatedAt: '2026-09-05T00:00:00' } });
    renderWithPreferences(
      <RangeeVeille prospect={clos} onglet="gagne" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    // Cinq jours civils entre le 5 et le 10 (MAINTENANT).
    expect(screen.getByText('5 j')).toBeDefined();
  });

  it('nomme l absence de mise à jour dans un onglet fermé, plutôt que d en inventer une', () => {
    // `PipelineView.updatedAt` n'est jamais nul tant qu'une ligne existe : la
    // seule façon d'atteindre l'absence, ici, est l'absence de ligne elle-même.
    renderWithPreferences(
      <RangeeVeille prospect={prospect({ pipeline: null })} onglet="perdu" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('non datée')).toBeDefined();
  });
});

describe('RangeeVeille — la colonne Site', () => {
  // Chacun des quatre rendus de `celluleSite` : le trait discontinu ne porte
  // QUE l'étage jamais passé, jamais un fait établi comme le retrait.
  const siteBase = {
    repoUrl: null,
    deploymentUrl: null,
    promptVersion: null,
    model: null,
    generatedAt: null,
    publishedAt: null,
    unpublishedAt: null,
    contentRejectedAt: null,
    redaction: null,
  };

  it('nomme « Jamais déployé », discontinu, quand l étage n est pas passé', () => {
    renderWithPreferences(
      <RangeeVeille prospect={prospect({ site: null })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    const badge = screen.getByText('Jamais déployé');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('data-ton')).toBe('neutre');
    expect(badge.getAttribute('data-discontinu')).toBe('true');
  });

  it('nomme « En ligne », plein, quand le site est déployé et publié', () => {
    const site = {
      ...siteBase,
      deploymentUrl: 'https://aquatech-nantes.pages.dev',
      generatedAt: '2026-09-02T00:00:00.000Z',
      publishedAt: '2026-09-03T00:00:00.000Z',
    };
    renderWithPreferences(
      <RangeeVeille prospect={prospect({ site })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    const badge = screen.getByText('En ligne');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('data-ton')).toBe('succes');
    // Un fait établi : jamais le trait discontinu, réservé à l'étage manquant.
    expect(badge.getAttribute('data-discontinu')).toBeNull();
  });

  it('nomme « Dépublié », plein et ambre, un site retiré étant un fait établi — pas une donnée manquante', () => {
    const site = {
      ...siteBase,
      deploymentUrl: 'https://aquatech-nantes.pages.dev',
      generatedAt: '2026-09-02T00:00:00.000Z',
      publishedAt: '2026-09-03T00:00:00.000Z',
      unpublishedAt: '2026-09-08T00:00:00.000Z',
    };
    renderWithPreferences(
      <RangeeVeille prospect={prospect({ site })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    const badge = screen.getByText('Dépublié');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('data-ton')).toBe('alerte');
    // La distinction que le trait discontinu doit garder : un retrait n'est
    // pas une absence, il ne le porte donc jamais.
    expect(badge.getAttribute('data-discontinu')).toBeNull();
  });

  it('nomme l étape de rédaction, plein, quand le site est généré mais pas encore publié', () => {
    const site = { ...siteBase, generatedAt: '2026-09-02T00:00:00.000Z' };
    renderWithPreferences(
      <RangeeVeille prospect={prospect({ site })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    const badge = screen.getByText('Rédaction');
    expect(badge).toBeDefined();
    expect(badge.getAttribute('data-ton')).toBe('accent');
    expect(badge.getAttribute('data-discontinu')).toBeNull();
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

describe('RangeeVeille — la colonne Score (constat de revue 3, sans test jusqu ici)', () => {
  it('affiche le total du score, pas seulement sa décoration', () => {
    renderWithPreferences(
      <RangeeVeille prospect={prospect({ score: score(83) })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('83')).toBeDefined();
  });

  it('nomme l absence de score par un tiret, jamais par un zéro', () => {
    renderWithPreferences(
      <RangeeVeille prospect={prospect({ score: null })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('—')).toBeDefined();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('met le score à l accent au seuil SCORE_FORT, jamais juste en-dessous', () => {
    const { unmount } = renderWithPreferences(
      <RangeeVeille prospect={prospect({ score: score(70) })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('70').getAttribute('data-fort')).toBe('true');
    unmount();

    renderWithPreferences(
      <RangeeVeille prospect={prospect({ score: score(69) })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('69').getAttribute('data-fort')).toBeNull();
  });

  it('porte le badge de métier, distinct par prospect', () => {
    const { unmount } = renderWithPreferences(
      <RangeeVeille prospect={prospect({ tradeSlug: 'plombier' })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('Plombier')).toBeDefined();
    unmount();

    renderWithPreferences(
      <RangeeVeille prospect={prospect({ tradeSlug: 'serrurier' })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(screen.getByText('Serrurier')).toBeDefined();
  });

  it('ne dessine aucun segment quand le barème n a jamais été détaillé, plutôt que trois blocs inventés', () => {
    // Plusieurs fixtures de cette suite (dont `prospect()` ci-dessus) passent
    // un `breakdown` vide avec un total non nul : `scoreSegments` y répond
    // par trois largeurs nulles (aucun point positif à répartir), et la
    // rangée ne doit alors RIEN dessiner — jamais les trois segments fixes
    // 11/9/7 qu'elle dessinait avant ce correctif, identiques sur toutes les
    // rangées quel que soit le prospect (constat de revue 1).
    const { container } = renderWithPreferences(
      <RangeeVeille prospect={prospect({ score: score(74) })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(0);
  });

  it('ne dessine pas de segment pour un bloc sans points positifs, comme ScoreBar', () => {
    const breakdown: ScoreLine[] = [
      { code: 'presence_has_site', label: 'Site correct', points: -100, group: 'presence' },
      { code: 'staff', label: 'Au moins 3 salariés', points: 10, group: 'vitalite' },
      { code: 'phone_mobile', label: 'Mobile trouvé', points: 20, group: 'joignabilite' },
    ];
    const { container } = renderWithPreferences(
      <RangeeVeille prospect={prospect({ score: score(30, breakdown) })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    const segments = [...container.querySelectorAll('[data-segment]')].map((s) => s.getAttribute('data-segment'));
    expect(segments).toEqual(['vitalite', 'joignabilite']);
  });

  it('fait varier les segments avec la décomposition réelle, jamais une largeur constante', () => {
    // Avant ce correctif, les trois largeurs étaient écrites en dur
    // (`11 - i * 2`) : un prospect dont TOUT le score vient de la présence
    // dessinait quand même trois segments. Ici, un seul groupe porte des
    // points : un seul segment doit apparaître.
    const breakdown: ScoreLine[] = [
      { code: 'presence_none', label: 'Aucune présence web', points: 35, group: 'presence' },
    ];
    const { container } = renderWithPreferences(
      <RangeeVeille prospect={prospect({ score: score(35, breakdown) })} onglet="a_contacter" selectionne={false} now={MAINTENANT} onSelect={() => {}} />,
    );
    const segments = [...container.querySelectorAll('[data-segment]')].map((s) => s.getAttribute('data-segment'));
    expect(segments).toEqual(['presence']);
  });
});
