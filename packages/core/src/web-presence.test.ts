import { describe, expect, it } from 'vitest';
import { classifyWebPresence, isHealthySite } from './web-presence.js';
import type { ProbeResult } from './types.js';

const healthy: ProbeResult = {
  url: 'https://plomberie-martin.fr',
  reachable: true,
  httpStatus: 200,
  isHttps: true,
  finalUrl: 'https://plomberie-martin.fr/',
  hasViewportMeta: true,
  isParked: false,
};

describe('isHealthySite', () => {
  it('accepte un site joignable, en HTTPS, responsive et non parqué', () => {
    expect(isHealthySite(healthy)).toBe(true);
  });

  it('rejette un site injoignable, en 404, sans HTTPS, parqué ou non responsive', () => {
    expect(isHealthySite({ ...healthy, reachable: false })).toBe(false);
    expect(isHealthySite({ ...healthy, httpStatus: 404 })).toBe(false);
    expect(isHealthySite({ ...healthy, isHttps: false })).toBe(false);
    expect(isHealthySite({ ...healthy, isParked: true })).toBe(false);
    expect(isHealthySite({ ...healthy, hasViewportMeta: false })).toBe(false);
  });
});

describe('classifyWebPresence', () => {
  it('none quand rien n est declare ni trouve', () => {
    expect(classifyWebPresence({ declaredUrl: null, socialUrls: [], probe: null })).toBe('none');
  });

  it('social_only quand l URL declaree est une page Facebook', () => {
    expect(
      classifyWebPresence({
        declaredUrl: 'https://www.facebook.com/plomberiemartin',
        socialUrls: [],
        probe: null,
      }),
    ).toBe('social_only');
  });

  it('social_only quand aucune URL declaree mais un reseau social trouve', () => {
    expect(
      classifyWebPresence({
        declaredUrl: null,
        socialUrls: ['https://instagram.com/plomberiemartin'],
        probe: null,
      }),
    ).toBe('social_only');
  });

  it('directory_only quand l URL declaree est un annuaire', () => {
    expect(
      classifyWebPresence({
        declaredUrl: 'https://www.pagesjaunes.fr/pros/12345',
        socialUrls: [],
        probe: null,
      }),
    ).toBe('directory_only');
  });

  it('dead_site quand le domaine propre repond mal', () => {
    expect(
      classifyWebPresence({
        declaredUrl: 'https://plomberie-martin.fr',
        socialUrls: [],
        probe: { ...healthy, httpStatus: 404 },
      }),
    ).toBe('dead_site');
  });

  it('has_site quand le domaine propre est sain', () => {
    expect(
      classifyWebPresence({
        declaredUrl: 'https://plomberie-martin.fr',
        socialUrls: [],
        probe: healthy,
      }),
    ).toBe('has_site');
  });

  it('renvoie null quand un domaine propre n a pas encore ete sonde', () => {
    expect(
      classifyWebPresence({
        declaredUrl: 'https://plomberie-martin.fr',
        socialUrls: [],
        probe: null,
      }),
    ).toBeNull();
  });

  it('traite une URL illisible comme un domaine propre non sonde', () => {
    expect(
      classifyWebPresence({ declaredUrl: 'pas une url', socialUrls: [], probe: null }),
    ).toBeNull();
  });
});
