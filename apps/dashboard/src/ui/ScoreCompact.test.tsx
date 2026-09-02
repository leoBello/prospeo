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

  it('un etablissement ferme (une seule ligne disqualifiant) affiche quand meme trois barres', () => {
    // groupBreakdown() ne rend qu'un groupe ici : { disqualifiant: [closed] }.
    // Le resume doit rester fixe a trois barres (presence/vitalite/joignabilite),
    // pas suivre l'ensemble variable que rend groupBreakdown().
    const { container } = renderWithPreferences(
      <ScoreCompact
        score={score({
          total: 0,
          breakdown: [{ code: 'closed', label: 'Établissement cessé', points: 0, group: 'disqualifiant' }],
        })}
      />,
    );
    const barres = container.querySelectorAll('[data-groupe]');
    expect(barres).toHaveLength(3);
    expect([...barres].map((b) => b.getAttribute('data-groupe'))).toEqual([
      'presence',
      'vitalite',
      'joignabilite',
    ]);
  });

  it('une franchise (trois groupes normaux + disqualifiant) garde trois barres au resume, et le recu montre la ligne disqualifiant', async () => {
    const user = userEvent.setup();
    const { container } = renderWithPreferences(
      <ScoreCompact
        score={score({
          breakdown: [
            { code: 'presence_none', label: 'Aucune présence web', points: 35, group: 'presence' },
            { code: 'rating', label: 'Note 4,6', points: 25, group: 'vitalite' },
            { code: 'phone_mobile', label: 'Mobile trouvé', points: 20, group: 'joignabilite' },
            { code: 'franchise', label: 'Enseigne de réseau', points: -30, group: 'disqualifiant' },
          ],
        })}
      />,
    );

    // Le resume reste a trois barres : disqualifiant n'en gagne pas une quatrieme.
    const barres = container.querySelectorAll('[data-groupe]');
    expect(barres).toHaveLength(3);

    // Le recu, lui, garde les quatre groupes : ces points comptent dans le total.
    await user.click(screen.getByRole('button', { name: /reçu/i }));
    expect(container.querySelector('[data-recu-groupe="disqualifiant"]')).not.toBeNull();
    expect(screen.getByText('Enseigne de réseau')).toBeDefined();
  });

  it('le recu affiche chaque ligne, points negatifs et signe compris, sans en perdre aucune', async () => {
    const user = userEvent.setup();
    const lignes = [
      { code: 'presence_none', label: 'Aucune présence web', points: 35, group: 'presence' as const },
      { code: 'rating', label: 'Note 4,6', points: 25, group: 'vitalite' as const },
      { code: 'phone_none', label: 'Aucun téléphone', points: -25, group: 'joignabilite' as const },
      { code: 'franchise', label: 'Enseigne de réseau', points: -30, group: 'disqualifiant' as const },
    ];
    renderWithPreferences(<ScoreCompact score={score({ breakdown: lignes })} />);
    await user.click(screen.getByRole('button', { name: /reçu/i }));

    for (const ligne of lignes) {
      const attendu = ligne.points >= 0 ? `+${ligne.points}` : `${ligne.points}`;
      const bloc = screen.getByText(ligne.label).closest('div');
      expect(bloc?.textContent).toContain(attendu);
    }
  });

  it('plafonne chaque barre au maximum que computeScore peut reellement emettre', () => {
    // Les trois plafonds sont epingles parce qu'ils ne se voient pas : une
    // barre trop haute ne fait que rester a demi pleine, ce qui ressemble a
    // une donnee mediocre et non a un defaut d'affichage.
    //
    // `vitalite` valait 70 (reputation 25 + volume d'avis 10 + fraicheur
    // sociale 15 + effectif 10 + anciennete 10). Or `reviewsVolume` et
    // `socialFresh` sont INERTES faute d'ecrivain : le maximum atteignable
    // etait 45, soit 64 % d'une barre dont les deux voisines montent a 100 %.
    // Deux prospects a 71 cessaient d'etre comparables d'un coup d'oeil, ce
    // qui est la seule raison d'avoir trois barres fixes.
    //
    // Le jour ou l'une des deux sources revient, ce test est ce qui oblige a
    // remonter le plafond en meme temps que le bareme.
    const { container } = renderWithPreferences(<ScoreCompact score={score()} />);
    const plafonds = [...container.querySelectorAll('[data-groupe]')].map((b) => [
      b.getAttribute('data-groupe'),
      b.getAttribute('data-plafond'),
    ]);
    expect(plafonds).toEqual([
      ['presence', '45'],
      ['vitalite', '45'],
      ['joignabilite', '20'],
    ]);
  });

  it('remplit entierement la barre vitalite au maximum reellement atteignable', () => {
    // Le pendant visible du test precedent : un prospect qui coche TOUT ce
    // que `computeScore` sait emettre en vitalite doit voir sa barre pleine.
    // Avec l'ancien plafond de 70, cette meme barre s'arretait a 64 %.
    const { container } = renderWithPreferences(
      <ScoreCompact
        score={score({
          breakdown: [
            { code: 'reputation', label: '4.8 ★', points: 25, group: 'vitalite' },
            { code: 'staff', label: 'Au moins 6 salariés', points: 10, group: 'vitalite' },
            { code: 'age', label: 'Créée il y a 7 ans', points: 10, group: 'vitalite' },
          ],
        })}
      />,
    );
    const barre = container.querySelector('[data-groupe="vitalite"]');
    const remplissage = barre?.querySelector('[style*="width"]');
    expect(remplissage?.getAttribute('style')).toContain('width: 100%');
  });

  it('une absence de score garde le libelle court visible, la phrase longue en survol', () => {
    // ScoreBar.tsx resout deja ce cas : le libelle court reste visible pour le
    // cas majoritaire (114 prospects sur 139), la phrase longue passe en
    // infobulle plutot que d'occuper la place en permanence.
    renderWithPreferences(<ScoreCompact score={null} />);
    expect(screen.getByText('pas encore scoré')).toBeDefined();
    expect(screen.queryByText(/Ce prospect n.a pas de score/i)).toBeNull();
  });
});
