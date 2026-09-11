import { describe, expect, it } from 'vitest';
import { affichageTelephone, normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it('reconnaît un mobile au format national', () => {
    expect(normalizePhone('06 12 34 56 78')).toEqual({ e164: '+33612345678', kind: 'mobile' });
    expect(normalizePhone('07.98.76.54.32')).toEqual({ e164: '+33798765432', kind: 'mobile' });
  });

  it('reconnaît un fixe', () => {
    expect(normalizePhone('02 40 12 34 56')).toEqual({ e164: '+33240123456', kind: 'landline' });
  });

  it('accepte le format international', () => {
    expect(normalizePhone('+33 6 12 34 56 78')).toEqual({ e164: '+33612345678', kind: 'mobile' });
    expect(normalizePhone('0033612345678')).toEqual({ e164: '+33612345678', kind: 'mobile' });
  });

  it('rejette les numéros invalides', () => {
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('06 12 34 56')).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it('rejette un numéro français ne commençant pas par 1-9 après le 0', () => {
    expect(normalizePhone('00 12 34 56 78')).toBeNull();
  });

  it('tolère une étiquette avant le numéro', () => {
    expect(normalizePhone('Tél : 06 12 34 56 78')).toEqual({ e164: '+33612345678', kind: 'mobile' });
  });

  it('rejette une lettre à l intérieur ou après le numéro', () => {
    expect(normalizePhone('06X12345678')).toBeNull();
    expect(normalizePhone('06 12 34 56 78 poste 4')).toBeNull();
  });

  it('rejette une chaîne sans aucun chiffre', () => {
    expect(normalizePhone('appeler le patron')).toBeNull();
  });
});

describe('affichageTelephone', () => {
  it('rend un mobile par groupes de deux chiffres, comme on le lit à voix haute', () => {
    expect(affichageTelephone('+33612440831')).toBe('06 12 44 08 31');
  });

  it('rend un fixe de la même façon — le format ne dépend pas du type', () => {
    expect(affichageTelephone('+33240765512')).toBe('02 40 76 55 12');
  });

  it('laisse intact un numéro qui n est pas français, plutôt que de le tronquer', () => {
    // Cette fonction met en forme, elle ne valide pas : c'est `normalizePhone`
    // qui valide. Un numéro étranger découpé selon le plan français serait
    // faux, et un numéro affiché faux se compose faux.
    expect(affichageTelephone('+3225551234')).toBe('+3225551234');
  });
});
