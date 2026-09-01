import { describe, expect, it } from 'vitest';
import { normalizeCompanyName } from './normalize.js';

describe('normalizeCompanyName', () => {
  it('met en minuscules et retire les accents', () => {
    expect(normalizeCompanyName('Plomberie Générale ÉTÉ')).toBe('plomberie generale ete');
  });

  it('retire les formes juridiques', () => {
    expect(normalizeCompanyName('SARL PLOMBERIE MARTIN')).toBe('plomberie martin');
    expect(normalizeCompanyName('Plomberie Martin SAS')).toBe('plomberie martin');
    expect(normalizeCompanyName('EURL DUPONT ET FILS')).toBe('dupont et fils');
  });

  it('normalise la ponctuation et les espaces multiples', () => {
    expect(normalizeCompanyName('  MARTIN  &   FILS  ')).toBe('martin et fils');
    expect(normalizeCompanyName('PLOMB-EXPRESS (44)')).toBe('plomb express 44');
  });

  it('ne supprime pas une forme juridique incluse dans un mot', () => {
    expect(normalizeCompanyName('SASSENAGE PLOMBERIE')).toBe('sassenage plomberie');
  });

  it('renvoie une chaîne vide pour une entrée vide', () => {
    expect(normalizeCompanyName('   ')).toBe('');
  });
});
