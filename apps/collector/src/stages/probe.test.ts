import { describe, expect, it } from 'vitest';
import { detectParked, hasViewport, probeUrl, shouldProbe } from './probe.js';

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

  it('ne prend pas un chantier en construction pour une page parquee', () => {
    expect(
      detectParked(
        '<title>Plomberie Martin</title><p>Nous intervenons sur tous les chantiers en construction du secteur.</p>',
      ),
    ).toBe(false);
  });

  it('ignore un marqueur enfoui loin dans le corps de la page', () => {
    const html = `<title>Plomberie Martin</title><div>${'x'.repeat(4000)}</div><p>coming soon</p>`;
    expect(detectParked(html)).toBe(false);
  });

  it('repere un marqueur present dans le titre', () => {
    expect(detectParked('<title>Site en construction</title><body></body>')).toBe(true);
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

  it('deduit HTTPS de l URL finale apres redirection', async () => {
    const result = await probeUrl('http://plomberie-martin.fr', async () => ({
      status: 200,
      finalUrl: 'https://plomberie-martin.fr/',
      body: '<meta name="viewport" content="width=device-width">',
    }));
    expect(result.isHttps).toBe(true);
    expect(result.finalUrl).toBe('https://plomberie-martin.fr/');
  });
});

describe('shouldProbe', () => {
  const now = new Date('2026-09-01T12:00:00Z');

  it('sonde une URL jamais sondée', () => {
    expect(shouldProbe(null, now, false)).toBe(true);
  });

  it('ne resonde pas dans la fenêtre de fraîcheur', () => {
    expect(shouldProbe('2026-08-28T12:00:00Z', now, false)).toBe(false);
  });

  it('resonde au-delà de la fenêtre', () => {
    expect(shouldProbe('2026-08-20T12:00:00Z', now, false)).toBe(true);
  });

  it('resonde toujours sous --force', () => {
    expect(shouldProbe('2026-08-31T12:00:00Z', now, true)).toBe(true);
  });

  it('sonde quand l horodatage est illisible plutôt que de le supposer frais', () => {
    expect(shouldProbe('pas une date', now, false)).toBe(true);
  });

  it('sonde quand l horodatage est dans le futur plutôt que de le croire frais', () => {
    expect(shouldProbe('2026-09-15T12:00:00Z', now, false)).toBe(true);
  });
});
