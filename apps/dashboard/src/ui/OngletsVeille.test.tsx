import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ComptesVeille } from '../domain/veille.js';
import { OngletsVeille } from './OngletsVeille.js';
import { renderWithPreferences } from '../test-utils.js';

function comptes(surcharges: Partial<ComptesVeille['parOnglet']> = {}): ComptesVeille {
  return {
    parOnglet: {
      a_contacter: 127,
      contacte: 1,
      relance: 1,
      interesse: 0,
      gagne: 0,
      perdu: 0,
      ne_pas_contacter: 0,
      toutes: 129,
      ...surcharges,
    },
    sansScore: 10,
    sansSuivi: 137,
  };
}

describe('OngletsVeille', () => {
  it('rend les huit onglets, y compris ceux à zéro — un onglet vide est une étape du parcours', () => {
    renderWithPreferences(
      <OngletsVeille onglet="a_contacter" comptes={comptes()} onChoisir={() => {}} />,
    );
    const onglets = screen.getAllByRole('tab');
    expect(onglets).toHaveLength(8);
    // Les libellés se lisent dans fr.ts : `pipeline.status.*` et `veille.onglet.toutes`.
    expect(onglets.map((o) => o.textContent)).toEqual([
      'À contacter127',
      'Contacté1',
      'Relancé1',
      'Intéressé0',
      'Gagné0',
      'Perdu0',
      'Ne pas contacter0',
      'Toutes129',
    ]);
  });

  it('marque l onglet courant par `aria-selected`, et non par la seule couleur', () => {
    // Ni `toHaveAccessibleName` ni `toBeInTheDocument` : ce dépôt n'installe
    // pas `@testing-library/jest-dom` (voir `test-setup.ts`), donc l'assertion
    // se fait par l'attribut lui-même, avec les matchers natifs de vitest.
    renderWithPreferences(
      <OngletsVeille onglet="relance" comptes={comptes()} onChoisir={() => {}} />,
    );
    const onglet = screen.getByRole('tab', { selected: true });
    expect(onglet.getAttribute('aria-label')).toMatch(/Relancé/);
  });

  it('annonce le compte en toutes lettres, un chiffre nu étant imprononçable', () => {
    renderWithPreferences(
      <OngletsVeille onglet="a_contacter" comptes={comptes()} onChoisir={() => {}} />,
    );
    // `getByRole` lève déjà si aucun onglet ne porte ce nom accessible :
    // c'est l'assertion, comme ailleurs dans cette suite (voir Nav.test.tsx).
    expect(screen.getByRole('tab', { name: 'À contacter : 127 prospects' })).toBeDefined();
    expect(screen.getByRole('tab', { name: 'Contacté : 1 prospect' })).toBeDefined();
  });

  it('prévient l appelant de l onglet choisi', async () => {
    const onChoisir = vi.fn();
    renderWithPreferences(
      <OngletsVeille onglet="a_contacter" comptes={comptes()} onChoisir={onChoisir} />,
    );
    await userEvent.click(screen.getByRole('tab', { name: /^Gagné/ }));
    expect(onChoisir).toHaveBeenCalledWith('gagne');
  });
});
