import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithPreferences } from '../test-utils.js';
import type { ScoreView } from '../domain/prospect.js';
import { ScoreCompact } from './ScoreCompact.js';

const score = (patch: Partial<ScoreView> = {}): ScoreView => ({
  total: 74,
  rulesetVersion: 'v3',
  computedAt: '2026-09-02T00:00:00Z',
  breakdown: [
    { code: 'presence_none', label: 'Aucune présence web', points: 30, group: 'presence' },
    { code: 'rating', label: 'Note 4,6', points: 16, group: 'vitalite' },
    { code: 'age', label: 'Plus de 3 ans', points: 10, group: 'vitalite' },
    { code: 'phone_mobile', label: 'Mobile trouvé', points: 18, group: 'joignabilite' },
  ],
  ...patch,
});

describe('ScoreCompact', () => {
  it('affiche le total dans la jauge', () => {
    renderWithPreferences(<ScoreCompact score={score()} />);
    expect(screen.getByText('74')).toBeDefined();
  });

  it('affiche une absence de score comme une absence, jamais comme un zero', () => {
    // 114 prospects sur 139. Un « 0 » les ferait lire comme juges sans valeur,
    // alors qu'ils n'ont pas ete juges.
    const { container } = renderWithPreferences(<ScoreCompact score={null} />);
    expect(container.querySelector('[data-absent="true"]')).not.toBeNull();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('resume les trois groupes sans deplier le recu', () => {
    renderWithPreferences(<ScoreCompact score={score()} />);
    expect(screen.getByText('Présence')).toBeDefined();
    expect(screen.getByText('Vitalité')).toBeDefined();
    expect(screen.getByText('Joignabilité')).toBeDefined();
    // Le detail ligne par ligne n'est pas rendu tant qu'on ne l'ouvre pas.
    expect(screen.queryByText('Note 4,6')).toBeNull();
  });

  it('deplie le recu ligne par ligne a la demande, libelles du bareme intacts', async () => {
    // Les libelles du breakdown sont des DONNEES, ecrites en francais par le
    // bareme du collector. Les traduire supposerait de reimplementer ici la
    // fabrication des libelles, qui deriverait a la premiere evolution des
    // regles (§9.5).
    const user = userEvent.setup();
    renderWithPreferences(<ScoreCompact score={score()} />);
    await user.click(screen.getByRole('button', { name: /reçu/i }));
    expect(screen.getByText('Note 4,6')).toBeDefined();
    expect(screen.getByText('Aucune présence web')).toBeDefined();
  });

  it('donne a la jauge une description chiffree, la couleur seule ne disant rien', () => {
    renderWithPreferences(<ScoreCompact score={score()} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('74');
  });
});
