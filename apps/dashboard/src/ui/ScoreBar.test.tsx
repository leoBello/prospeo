import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import type { ScoreView } from '../domain/prospect.js';
import { ScoreBar } from './ScoreBar.js';

const score = (patch: Partial<ScoreView> = {}): ScoreView => ({
  total: 30,
  rulesetVersion: 'v2',
  computedAt: '2026-09-01T00:00:00Z',
  breakdown: [
    { code: 'presence_none', label: 'Aucune présence web', points: 35, group: 'presence' },
    { code: 'staff', label: 'Au moins 3 salariés', points: 10, group: 'vitalite' },
    { code: 'phone_none', label: 'Aucun téléphone', points: -25, group: 'joignabilite' },
  ],
  ...patch,
});

describe('ScoreBar', () => {
  it('affiche une absence de score comme une absence, et non comme un zero', () => {
    // 114 prospects sur 139 sont dans ce cas. Un « 0 » les ferait lire comme
    // des prospects jugés sans valeur, alors qu'ils n'ont pas été jugés.
    renderWithPreferences(<ScoreBar score={null} currentRulesetVersion="v2" />);
    expect(screen.getByText('pas encore scoré')).toBeDefined();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('affiche un zero calcule comme un zero, la distinction avec l absence restant lisible', () => {
    renderWithPreferences(
      <ScoreBar
        score={score({
          total: 0,
          breakdown: [
            { code: 'presence_has_site', label: 'Site correct', points: -100, group: 'presence' },
          ],
        })}
        currentRulesetVersion="v2"
      />,
    );
    expect(screen.getByText('0')).toBeDefined();
    expect(screen.queryByText('pas encore scoré')).toBeNull();
  });

  it('donne a la barre une description qui nomme le total, la couleur seule ne disant rien', () => {
    renderWithPreferences(<ScoreBar score={score()} currentRulesetVersion="v2" />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('30');
  });

  it('ne dessine pas de segment pour un bloc en negatif', () => {
    const { container } = renderWithPreferences(
      <ScoreBar score={score()} currentRulesetVersion="v2" />,
    );
    const segments = container.querySelectorAll('[data-segment]');
    expect([...segments].map((s) => s.getAttribute('data-segment'))).toEqual([
      'presence',
      'vitalite',
    ]);
  });

  it('signale un score calcule avec une version anterieure du bareme', () => {
    // Sans ce signalement, un chiffre obsolète s'affiche avec l'aplomb d'un
    // chiffre à jour. C'est le cas de la totalité des scores en base.
    renderWithPreferences(<ScoreBar score={score({ rulesetVersion: 'v1' })} currentRulesetVersion="v2" />);
    expect(screen.getByText(/barème v1/)).toBeDefined();
  });

  it('ne signale rien quand le bareme du score est celui en vigueur', () => {
    renderWithPreferences(<ScoreBar score={score()} currentRulesetVersion="v2" />);
    expect(screen.queryByText(/barème/)).toBeNull();
  });
});
