import { describe, expect, it } from 'vitest';
import { createVercelOAuthClient } from './vercel-oauth.js';

function faussetch(reponses: { status: number; body?: unknown }[]) {
  const appels: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fn = async (url: string, init: RequestInit = {}) => {
    appels.push({ url, init });
    const r = reponses[Math.min(i++, reponses.length - 1)] ?? { status: 200 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => JSON.stringify(r.body ?? {}),
      json: async () => r.body ?? {},
    } as unknown as Response;
  };
  return { fn: fn as unknown as typeof fetch, appels };
}

describe('createVercelOAuthClient — echangerCode', () => {
  it('poste les quatre champs en x-www-form-urlencoded, et rend le jeton', async () => {
    const { fn, appels } = faussetch([
      { status: 200, body: { access_token: 'jeton-vercel', team_id: 'team_x' } },
    ]);
    const client = createVercelOAuthClient({ clientId: 'id1', clientSecret: 'secret1', fetch: fn });
    const jeton = await client.echangerCode('code-recu', 'https://relais.example/api/vercel/callback');

    expect(jeton).toEqual({ accessToken: 'jeton-vercel', teamId: 'team_x' });
    expect(appels[0]?.url).toBe('https://api.vercel.com/v2/oauth/access_token');
    expect(appels[0]?.init.method).toBe('POST');
    const entetes = appels[0]?.init.headers as Record<string, string>;
    expect(entetes['Content-Type']).toBe('application/x-www-form-urlencoded');
    const corps = new URLSearchParams(String(appels[0]?.init.body));
    expect(corps.get('client_id')).toBe('id1');
    expect(corps.get('client_secret')).toBe('secret1');
    expect(corps.get('code')).toBe('code-recu');
    expect(corps.get('redirect_uri')).toBe('https://relais.example/api/vercel/callback');
  });

  it('rend teamId null sur un compte personnel', async () => {
    const { fn } = faussetch([{ status: 200, body: { access_token: 'jeton-vercel', team_id: null } }]);
    const client = createVercelOAuthClient({ clientId: 'id1', clientSecret: 'secret1', fetch: fn });
    const jeton = await client.echangerCode('code-recu', 'https://relais.example/api/vercel/callback');
    expect(jeton.teamId).toBeNull();
  });

  it('échoue franchement si Vercel refuse le code', async () => {
    const { fn } = faussetch([{ status: 400, body: { error: 'invalid_grant' } }]);
    const client = createVercelOAuthClient({ clientId: 'id1', clientSecret: 'secret1', fetch: fn });
    await expect(client.echangerCode('code-perime', 'https://relais.example/api/vercel/callback')).rejects.toThrow(
      /400/,
    );
  });
});
