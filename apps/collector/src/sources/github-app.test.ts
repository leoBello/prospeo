import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { createGithubAppClient, signerJwtApp } from './github-app.js';

/** Une vraie paire de clés RSA, générée pour ce fichier — jamais une clé réelle. */
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

describe('signerJwtApp', () => {
  it('produit un JWT à trois segments, vérifiable avec la clé publique', () => {
    const jwt = signerJwtApp('123456', privateKey);
    const segments = jwt.split('.');
    expect(segments).toHaveLength(3);

    const [entete, charge, signature] = segments;
    const verificateur = createVerify('RSA-SHA256');
    verificateur.update(`${entete}.${charge}`);
    expect(verificateur.verify(publicKey, signature as string, 'base64url')).toBe(true);

    const chargeDecodee = JSON.parse(Buffer.from(charge as string, 'base64url').toString('utf8'));
    expect(chargeDecodee.iss).toBe('123456');
  });

  it('refuse une vérification sous une AUTRE clé publique', () => {
    const { publicKey: autrePublique } = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    const jwt = signerJwtApp('123456', privateKey);
    const [entete, charge, signature] = jwt.split('.');
    const verificateur = createVerify('RSA-SHA256');
    verificateur.update(`${entete}.${charge}`);
    expect(verificateur.verify(autrePublique, signature as string, 'base64url')).toBe(false);
  });
});

describe('createGithubAppClient — creerJetonInstallation', () => {
  function fausseReponse(status: number, corps: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(corps),
      json: async () => corps,
    } as unknown as Response;
  }

  it('signe une requête Bearer POST et rend le jeton fabriqué', async () => {
    const appels: { url: string; init?: RequestInit }[] = [];
    const fausseFetch = (async (url: string, init?: RequestInit) => {
      appels.push({ url, init });
      return fausseReponse(201, { token: 'ghs_xxx', expires_at: '2026-01-01T00:00:00Z' });
    }) as unknown as typeof fetch;

    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    const resultat = await client.creerJetonInstallation('999');

    expect(resultat).toEqual({ ok: true, token: 'ghs_xxx' });
    expect(appels[0]?.url).toBe('https://api.github.com/app/installations/999/access_tokens');
    expect(appels[0]?.init?.method).toBe('POST');
    const entetes = appels[0]?.init?.headers as Record<string, string>;
    expect(entetes.Authorization).toMatch(/^Bearer /);
  });

  it('rend motif "revoquee" sur un 404 — installation supprimée ou suspendue', async () => {
    const fausseFetch = (async () => fausseReponse(404, { message: 'Not Found' })) as unknown as typeof fetch;
    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    const resultat = await client.creerJetonInstallation('999');
    expect(resultat).toEqual({ ok: false, motif: 'revoquee', message: expect.stringContaining('404') });
  });

  it('rend motif "revoquee" sur un 401', async () => {
    const fausseFetch = (async () => fausseReponse(401, { message: 'Bad credentials' })) as unknown as typeof fetch;
    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    const resultat = await client.creerJetonInstallation('999');
    expect(resultat.ok).toBe(false);
    expect((resultat as { motif: string }).motif).toBe('revoquee');
  });

  it('rend motif "echec" — jamais "revoquee" — sur une panne transitoire (5xx)', async () => {
    const fausseFetch = (async () => fausseReponse(503, { message: 'Service Unavailable' })) as unknown as typeof fetch;
    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    const resultat = await client.creerJetonInstallation('999');
    expect(resultat).toEqual({ ok: false, motif: 'echec', message: expect.stringContaining('503') });
  });
});
