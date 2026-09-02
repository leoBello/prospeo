import { describe, expect, it } from 'vitest';
import { estMac } from './plateforme.js';

describe('estMac', () => {
  it('reconnait macOS depuis navigator.platform', () => {
    expect(estMac({ platform: 'MacIntel', userAgent: '' })).toBe(true);
  });

  it('reconnait Windows depuis navigator.platform, sans se rabattre sur le user agent', () => {
    expect(estMac({ platform: 'Win32', userAgent: 'Macintosh; Intel Mac OS X 10_15' })).toBe(false);
  });

  it('se rabat sur le user agent quand platform ne tranche pas', () => {
    expect(
      estMac({ platform: '', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }),
    ).toBe(true);
  });

  it('choisit Ctrl par defaut quand rien ne tranche', () => {
    expect(estMac({ platform: '', userAgent: '' })).toBe(false);
    expect(
      estMac({ platform: '', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }),
    ).toBe(false);
  });
});
