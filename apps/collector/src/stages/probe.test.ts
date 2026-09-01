import { describe, expect, it } from 'vitest';
import { detectParked, domainCandidates, hasViewport, probeUrl } from './probe.js';

describe('hasViewport', () => {
  it('detecte la balise viewport', () => {
    expect(hasViewport('<meta name="viewport" content="width=device-width">')).toBe(true);
    expect(hasViewport("<META NAME='VIEWPORT' CONTENT='width=device-width'>")).toBe(true);
    expect(hasViewport('<html><body>rien</body></html>')).toBe(false);
  });
});

describe('detectParked', () => {
  it('repere les pages parquees', () => {
    expect(detectParked('<title>Ce domaine est à vendre</title>')).toBe(true);
    expect(detectParked('<p>This domain is for sale</p>')).toBe(true);
    expect(detectParked('<p>Site en construction</p>')).toBe(true);
    expect(detectParked('<h1>Plomberie Martin, dépannage 24h/24</h1>')).toBe(false);
  });
});

describe('probeUrl', () => {
  it('rend un verdict complet pour un site sain', async () => {
    const result = await probeUrl('https://plomberie-martin.fr', async () => ({
      status: 200,
      finalUrl: 'https://plomberie-martin.fr/',
      body: '<meta name="viewport" content="width=device-width"><h1>Plomberie</h1>',
    }));
    expect(result).toEqual({
      url: 'https://plomberie-martin.fr',
      reachable: true,
      httpStatus: 200,
      isHttps: true,
      finalUrl: 'https://plomberie-martin.fr/',
      hasViewportMeta: true,
      isParked: false,
    });
  });

  it('marque injoignable sans lever quand la requete echoue', async () => {
    const result = await probeUrl('https://mort.fr', async () => {
      throw new Error('ENOTFOUND');
    });
    expect(result.reachable).toBe(false);
    expect(result.httpStatus).toBeNull();
  });

  it('detecte l absence de HTTPS depuis l URL finale', async () => {
    const result = await probeUrl('http://vieux.fr', async () => ({
      status: 200,
      finalUrl: 'http://vieux.fr/',
      body: '<html></html>',
    }));
    expect(result.isHttps).toBe(false);
  });
});

describe('domainCandidates', () => {
  it('propose des variantes en .fr a partir de la raison sociale', () => {
    expect(domainCandidates('SARL PLOMBERIE MARTIN')).toEqual([
      'plomberie-martin.fr',
      'plomberiemartin.fr',
      'martin-plomberie.fr',
    ]);
  });

  it('renvoie une liste vide pour un nom d un seul mot', () => {
    expect(domainCandidates('MARTIN')).toEqual(['martin.fr']);
  });

  it('tolere un nom vide', () => {
    expect(domainCandidates('SARL')).toEqual([]);
  });
});
