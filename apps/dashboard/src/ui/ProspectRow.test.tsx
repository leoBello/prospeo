import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView, ReasonFragment, WorkRow } from '../domain/prospect.js';
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
    // 114 prospects sur 139 sont dans ce cas : c'est l'affichage le plus
    // frequent, pas un cas degrade.
    rendre(ligne({ pipeline: null }));
    expect(screen.getByText('Jamais contacté')).toBeDefined();
  });

  it('rend la raison de presence, fragment traduit et fragment brut compris', () => {
    rendre(ligne());
    expect(screen.getByText(/relance en retard de 3 j/)).toBeDefined();
    // Le fragment `raw` est une donnee du bareme, pas une clef : elle doit
    // apparaitre telle quelle, sans passer par `t()`.
    expect(screen.getByText(/Aucune présence web/)).toBeDefined();
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
});
