import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView, ReasonFragment, WorkRow } from '../domain/prospect.js';
import { fr } from '../i18n/fr.js';
import { ProspectRow } from './ProspectRow.js';

function prospect(patch: Partial<ProspectView> = {}): ProspectView {
  return {
    id: 'p1',
    siret: '11111111100001',
    denomination: 'ENTREPRISE TEST',
    denominationUsuelle: null,
    tradeSlug: 'plombier',
    address: '5 RUE LE NOTRE 44000 NANTES',
    postalCode: '44000',
    city: 'NANTES',
    dateCreation: '2012-12-15',
    effectifCode: '02',
    isClosed: false,
    discoveredAt: '2026-09-01T01:38:07Z',
    score: null,
    presence: null,
    enrichment: null,
    pipeline: null,
    site: null,
    messages: [],
    ...patch,
  };
}

// Un fragment traduit et un fragment brut : les deux natures que le domaine
// distingue (§9.5), et que la ligne doit rendre l'une comme l'autre.
const raison: ReasonFragment[] = [
  { kind: 'key', key: 'today.reason.followUp.late', params: { days: 3 } },
  { kind: 'raw', text: 'Aucune présence web' },
];

function ligne(patch: Partial<ProspectView> = {}, reason: ReasonFragment[] = raison): WorkRow {
  return { prospect: prospect(patch), reason };
}

function rendre(row: WorkRow, opts: { selected?: boolean; onSelect?: (id: string) => void } = {}) {
  return renderWithPreferences(
    <ProspectRow
      row={row}
      selected={opts.selected ?? false}
      currentRulesetVersion="v2"
      onSelect={opts.onSelect ?? vi.fn()}
    />,
  );
}

describe('ProspectRow', () => {
  it('rend le nom du prospect', () => {
    rendre(ligne({ denomination: 'PLOMBERIE GUERIN' }));
    expect(screen.getByText('PLOMBERIE GUERIN')).toBeDefined();
  });

  it('rend le badge de statut reel, distinct du texte d absence de pipeline', () => {
    rendre(
      ligne({
        pipeline: { status: 'relance', nextActionAt: null, updatedAt: '2026-09-01T00:00:00Z' },
      }),
    );
    expect(screen.getByText('Relancé')).toBeDefined();
    expect(screen.queryByText('Jamais contacté')).toBeNull();
  });

  it('nomme l absence de ligne de pipeline plutot que de laisser le badge muet', () => {
    // 137 prospects sur 139 sont dans ce cas (releve du 2 septembre 2026) :
    // c'est l'affichage le plus frequent, pas un cas degrade.
    rendre(ligne({ pipeline: null }));
    expect(screen.getByText('Jamais contacté')).toBeDefined();
  });

  it('rend le badge de statut en taille compacte, celle de la maquette pour une ligne', () => {
    // Le panneau (22px/11px) et la ligne (19px/10px, methode `ligne()` de la
    // maquette) n'utilisent pas la meme taille : sans ce choix, le badge
    // depasse la hauteur du nom et gonfle chaque ligne de 8px (§9.4).
    const { container } = rendre(ligne());
    expect(container.querySelector('[data-taille="compacte"]')).not.toBeNull();
  });

  it('rend la raison de presence, fragment traduit et fragment brut compris', () => {
    rendre(ligne());
    expect(screen.getByText(/relance en retard de 3 j/)).toBeDefined();
    // Le fragment `raw` est une donnee du bareme, pas une clef : elle doit
    // apparaitre telle quelle, sans passer par `t()`.
    expect(screen.getByText(/Aucune présence web/)).toBeDefined();
  });

  it('rend la pastille d avertissement de coherence quand la ligne cable dataWarnings vers ScoreBar', () => {
    // Correctif de revue (tache 9) : ce cablage `ProspectRow -> dataWarnings
    // -> ScoreBar` n'avait plus aucun garde d'integration — seuls le calcul
    // (`domain/coherence.test.ts`) et le rendu de la pastille
    // (`ui/ScoreBar.test.tsx`) l'etaient. Categorie « aucune presence web »
    // dementie par une URL declaree (§ coherence.ts, cas 1) : le seul
    // ecart qui n'exige pas d'aligner deux horodatages pour se produire.
    rendre(
      ligne({
        score: {
          total: 30,
          rulesetVersion: 'v2',
          computedAt: '2026-09-02T00:00:00Z',
          breakdown: [
            { code: 'presence_none', label: 'Aucune présence web', points: 35, group: 'presence' },
            { code: 'phone_none', label: 'Aucun téléphone', points: -25, group: 'joignabilite' },
          ],
        },
        presence: {
          category: 'none',
          finalUrl: null,
          httpStatus: null,
          domainAvailable: null,
          probedAt: null,
        },
        enrichment: {
          status: 'ok',
          phoneE164: null,
          phoneKind: null,
          rating: null,
          reviewCount: null,
          declaredUrl: 'https://aubert-services.fr/serrurier-nantes/',
          matchedName: 'Aubert Services',
          matchConfidence: 0.99,
          enrichedAt: '2026-09-01T00:00:00Z',
        },
      }),
    );
    const pastille = screen.getAllByRole('img').find((el) => el.textContent === '!');
    expect(pastille).toBeDefined();
    expect(pastille?.getAttribute('title')).toContain('démentie par le site déclaré');
  });

  it('nomme l absence de score par un mot, jamais par un zero ni par un vide', () => {
    rendre(ligne({ score: null }));
    expect(screen.getByText('pas encore scoré')).toBeDefined();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('porte aria-current sur la ligne selectionnee, un attribut et non seulement une couleur', () => {
    rendre(ligne(), { selected: true });
    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('true');
  });

  it('ne porte aucun aria-current quand la ligne n est pas selectionnee', () => {
    rendre(ligne(), { selected: false });
    expect(screen.getByRole('button').getAttribute('aria-current')).toBeNull();
  });

  it('appelle onSelect avec l identifiant du prospect au clic', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    rendre(ligne({ id: 'abc123' }), { onSelect });
    await user.click(screen.getByRole('button'));
    expect(onSelect).toHaveBeenCalledWith('abc123');
  });

  /**
   * La ligne tronque la raison sur un seul trait (maquette, l. 188), et jusqu'a
   * TROIS signaux du bareme s'y concatenent : le dernier est le premier a
   * disparaitre. Le plan interdit de « tronquer la raison au point de la rendre
   * inutile » — le texte complet doit donc rester atteignable.
   */
  it('garde la raison entiere atteignable meme quand la ligne la tronque', () => {
    const row = ligne({}, [
      { kind: 'raw', text: 'aucun site' },
      { kind: 'raw', text: 'note 4,9' },
      { kind: 'raw', text: 'mobile trouve' },
    ]);
    renderWithPreferences(
      <ul>
        <ProspectRow row={row} selected={false} currentRulesetVersion="v3" onSelect={() => {}} />
      </ul>,
    );
    // Le separateur est une donnee du catalogue, pas une invention : on le lit.
    const separateur = fr['today.reason.separator'];
    const attendu = ['aucun site', 'note 4,9', 'mobile trouve'].join(separateur);
    expect(screen.getByTitle(attendu)).toBeDefined();
  });
});
