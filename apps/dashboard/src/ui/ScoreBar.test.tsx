import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithPreferences } from '../test-utils.js';
import type { ScoreView } from '../domain/prospect.js';
import type { DataWarning } from '../domain/coherence.js';
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
    // 10 prospects sur 139 sont dans ce cas (releve du 2 septembre 2026). Un
    // « 0 » les ferait lire comme des prospects jugés sans valeur, alors
    // qu'ils n'ont pas été jugés.
    renderWithPreferences(<ScoreBar score={null} />);
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
      />,
    );
    expect(screen.getByText('0')).toBeDefined();
    expect(screen.queryByText('pas encore scoré')).toBeNull();
  });

  it('donne a la barre une description qui nomme le total, la couleur seule ne disant rien', () => {
    renderWithPreferences(<ScoreBar score={score()} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('30');
  });

  it('ne dessine pas de segment pour un bloc en negatif', () => {
    const { container } = renderWithPreferences(
      <ScoreBar score={score()} />,
    );
    const segments = container.querySelectorAll('[data-segment]');
    expect([...segments].map((s) => s.getAttribute('data-segment'))).toEqual([
      'presence',
      'vitalite',
    ]);
  });

  it('porte une pastille des qu un ecart est signale', () => {
    // Sans ce signalement, un chiffre douteux s'affiche avec l'aplomb d'un
    // chiffre sur. C'est le cas de la totalite des scores en base.
    const warnings: DataWarning[] = [
      { kind: 'score_stale_ruleset', stored: 'v1', current: 'v2' },
    ];
    renderWithPreferences(<ScoreBar score={score()} warnings={warnings} />);
    expect(screen.getAllByRole('img').length).toBe(2);
  });

  it('ne laisse jamais la pastille muette, une alerte sans contenu n etant qu un ornement inquietant', () => {
    const warnings: DataWarning[] = [
      { kind: 'presence_contradicted', declaredUrl: 'https://aubert-services.fr/' },
    ];
    renderWithPreferences(<ScoreBar score={score()} warnings={warnings} />);
    const pastille = screen.getAllByRole('img').find((e) => e.textContent === '!');
    expect(pastille?.getAttribute('aria-label')).toContain('aubert-services.fr');
  });

  it('n affiche aucune pastille quand rien n est signale', () => {
    renderWithPreferences(<ScoreBar score={score()} />);
    expect(screen.queryByText('!')).toBeNull();
  });
});
