import { describe, expect, it } from 'vitest';
import type { ScoreLine } from '@prospeo/core';
import { SCORE_BAR_GROUPS, groupBreakdown, isScoreStale, parseBreakdown, scoreSegments } from './score.js';

const ligne = (group: ScoreLine['group'], points: number, code: string = group): ScoreLine => ({
  code,
  label: code,
  points,
  group,
});

describe('scoreSegments', () => {
  it('rend les trois blocs toujours dans le meme ordre, sans quoi deux lignes ne se comparent pas au coup d oeil', () => {
    const segments = scoreSegments([ligne('joignabilite', 20), ligne('presence', 45)], 65);
    expect(segments.map((s) => s.group)).toEqual([...SCORE_BAR_GROUPS]);
  });

  it('laisse la piste vide au-dela du total, une barre pleine a 30 se lisant sinon comme un sans-faute', () => {
    const segments = scoreSegments([ligne('presence', 35)], 30);
    const largeur = segments.reduce((s, seg) => s + seg.widthPercent, 0);
    expect(largeur).toBeCloseTo(30, 6);
  });

  it('donne une largeur nulle au bloc en negatif, car c est le manque qui doit se voir', () => {
    // Cas réel et majoritaire dans la base : présence +35, vitalité +20,
    // joignabilité −25, total 30. Un segment de largeur négative n'existe pas ;
    // un segment absent, lui, dit exactement ce qui manque.
    const breakdown = [ligne('presence', 35), ligne('vitalite', 20), ligne('joignabilite', -25)];
    const segments = scoreSegments(breakdown, 30);
    const par = Object.fromEntries(segments.map((s) => [s.group, s.widthPercent]));
    expect(par['joignabilite']).toBe(0);
    expect(par['presence']).toBeGreaterThan(0);
    expect(par['vitalite']).toBeGreaterThan(0);
  });

  it('repartit les largeurs au prorata des points positifs de chaque bloc', () => {
    const breakdown = [ligne('presence', 30), ligne('vitalite', 10)];
    const segments = scoreSegments(breakdown, 40);
    const par = Object.fromEntries(segments.map((s) => [s.group, s.widthPercent]));
    expect(par['presence']).toBeCloseTo(30, 6);
    expect(par['vitalite']).toBeCloseTo(10, 6);
  });

  it('rend une barre entierement vide quand le total est nul, sans division par zero', () => {
    const segments = scoreSegments([ligne('presence', -100), ligne('joignabilite', 20)], 0);
    expect(segments.every((s) => s.widthPercent === 0)).toBe(true);
  });

  it('ignore les lignes disqualifiantes, qui ne sont pas un des trois blocs mais pesent deja dans le total', () => {
    const segments = scoreSegments([ligne('presence', 45), ligne('disqualifiant', -30)], 15);
    expect(segments.map((s) => s.group)).toEqual([...SCORE_BAR_GROUPS]);
    const largeur = segments.reduce((s, seg) => s + seg.widthPercent, 0);
    expect(largeur).toBeCloseTo(15, 6);
  });
});

describe('groupBreakdown', () => {
  it('groupe les lignes par bloc, dans l ordre de lecture, avec leur sous-total', () => {
    const groupes = groupBreakdown([
      ligne('joignabilite', -25, 'phone_none'),
      ligne('presence', 35, 'presence_none'),
      ligne('vitalite', 10, 'staff'),
      ligne('vitalite', 10, 'age'),
    ]);
    expect(groupes.map((g) => g.group)).toEqual(['presence', 'vitalite', 'joignabilite']);
    expect(groupes[1]?.subtotal).toBe(20);
    expect(groupes[1]?.lines).toHaveLength(2);
  });

  it('omet un bloc sans aucune ligne plutot que d afficher un intitule vide', () => {
    const groupes = groupBreakdown([ligne('presence', 35)]);
    expect(groupes.map((g) => g.group)).toEqual(['presence']);
  });
});

describe('isScoreStale', () => {
  it('signale un score calcule avec une version anterieure du bareme', () => {
    // Cas observé en base le 1er septembre 2026 : les 25 scores stockés sont
    // en v1 alors que `packages/core` est passé en v2.
    expect(isScoreStale('v1', 'v2')).toBe(true);
    expect(isScoreStale('v2', 'v2')).toBe(false);
  });
});

describe('parseBreakdown', () => {
  it('lit un barème stocké en jsonb', () => {
    const lignes = parseBreakdown([
      { code: 'presence_none', group: 'presence', label: 'Aucune présence web', points: 35 },
    ]);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]?.points).toBe(35);
  });

  it('ecarte une ligne illisible au lieu de faire tomber l ecran entier', () => {
    // La colonne est un `jsonb` sans contrainte : rien n'empêche une valeur
    // écrite par une version future d'y apparaître. Perdre une ligne de détail
    // est acceptable ; perdre la fiche ne l'est pas.
    const lignes = parseBreakdown([
      { code: 'ok', group: 'presence', label: 'ok', points: 10 },
      { code: 'casse', group: 'inconnu', label: 'x', points: 'beaucoup' },
      null,
      'texte',
    ]);
    expect(lignes.map((l) => l.code)).toEqual(['ok']);
  });

  it('rend un tableau vide quand la colonne ne contient pas un tableau', () => {
    expect(parseBreakdown(null)).toEqual([]);
    expect(parseBreakdown({ total: 30 })).toEqual([]);
  });
});
