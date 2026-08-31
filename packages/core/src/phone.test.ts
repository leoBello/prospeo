import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone.js';

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
});
