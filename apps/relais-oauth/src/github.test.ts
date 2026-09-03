import { describe, expect, it } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';
import { createGithubAppClient, signerJwtApp } from './github.js';

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

describe('createGithubAppClient — lireInstallation', () => {
  function fausseReponse(status: number, corps: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(corps),
      json: async () => corps,
    } as unknown as Response;
  }

  it('signe une requête Bearer et rend le libellé du compte installé', async () => {
    const appels: { url: string; init?: RequestInit }[] = [];
    const fausseFetch = (async (url: string, init?: RequestInit) => {
      appels.push({ url, init });
      return fausseReponse(200, { account: { login: 'mon-org' } });
    }) as unknown as typeof fetch;

    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    const installation = await client.lireInstallation('987');

    expect(installation).toEqual({ compteLibelle: 'mon-org' });
    expect(appels[0]?.url).toBe('https://api.github.com/app/installations/987');
    const entetes = appels[0]?.init?.headers as Record<string, string>;
    expect(entetes.Authorization).toMatch(/^Bearer /);
  });

  it("échoue franchement si GitHub refuse, avec le statut et le corps dans le message", async () => {
    const fausseFetch = (async () => fausseReponse(404, { message: 'Not Found' })) as unknown as typeof fetch;
    const client = createGithubAppClient({ appId: '123456', clePrivee: privateKey, fetch: fausseFetch });
    await expect(client.lireInstallation('987')).rejects.toThrow(/404/);
  });
});
