import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import type { ProspectView, WorkList } from '../domain/prospect.js';
import { WorkListSection } from './WorkListSection.js';

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

function liste(totalCount: number, items: ProspectView[] = []): WorkList {
  return { items: items.map((p) => ({ prospect: p, reason: [] })), totalCount };
}

function rendre(list: WorkList) {
  return renderWithPreferences(
    <WorkListSection
      titleKey="today.section.followUps"
      emptyKey="today.empty.followUps"
      list={list}
      selectedId={null}
      currentRulesetVersion="v2"
      onSelect={vi.fn()}
    />,
  );
}

describe('WorkListSection', () => {
  it('garde le mot dans le compteur de l en-tete, la pastille ne portant jamais une information par sa seule forme', () => {
    // La maquette n'affiche qu'un chiffre nu dans la pastille ; ce depot
    // interdit ailleurs (StatusBadge, ScoreBar) qu'une forme seule porte une
    // information, et l'exigence vaut ici aussi.
    rendre(liste(2, [prospect()]));
    expect(screen.getByText('2 prospects')).toBeDefined();
  });

  it('rend le compteur de l en-tete avec un ton neutre, y compris pour une section que la maquette teinte', () => {
    // La maquette teinte le compteur de « Relances dues » en rose : cette
    // teinte porterait une information par la seule couleur, ce que ce
    // depot interdit. Ce n'est pas un oubli.
    rendre(liste(3, [prospect()]));
    expect(screen.getByText('3 prospects').getAttribute('data-ton')).toBe('neutre');
  });
});
