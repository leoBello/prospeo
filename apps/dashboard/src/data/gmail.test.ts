import { describe, expect, it } from 'vitest';
import { createGmailClient, encoderMessage } from './gmail.js';

const MAIL = {
  de: 'leo@gmail.com',
  a: 'contact@artisan.fr',
  objet: 'Votre site ne répond plus',
  corps: 'Bonjour,\n\nJ’ai vu que votre site ne répondait plus.\n\nLéo',
};

/** Décode le base64url que `encoderMessage` produit, pour lire ce qui partira. */
function decoder(base64url: string): string {
  return Buffer.from(base64url, 'base64url').toString('utf8');
}

describe('encoderMessage', () => {
  it('produit un base64url, jamais un base64 standard', () => {
    // L'API Gmail refuse le base64 standard : « + » et « / » y sont invalides,
    // et le remplissage « = » casse l'URL.
    const encode = encoderMessage(MAIL);
    expect(encode).not.toMatch(/[+/=]/);
  });

  it('encode l’objet accentué en mot-encodé MIME, jamais en UTF-8 brut', () => {
    // LE DÉFAUT QUE CE TEST FERME. Un `Subject:` accentué envoyé tel quel
    // arrive en mojibake — et c'est le premier mot que lit l'artisan.
    const brut = decoder(encoderMessage(MAIL));
    expect(brut).toContain('Subject: =?UTF-8?B?');
    expect(brut).not.toContain('Subject: Votre site ne répond plus');
  });

  it('porte l’expéditeur, le destinataire et le corps intact', () => {
    const brut = decoder(encoderMessage(MAIL));
    expect(brut).toContain('From: leo@gmail.com');
    expect(brut).toContain('To: contact@artisan.fr');
    // Les sauts de ligne sont signifiants : la maquette dit que la ligne
    // isolée qui porte l'URL EST l'argument.
    expect(brut).toContain('J’ai vu que votre site ne répondait plus.');
  });

  it('déclare un corps UTF-8, sans quoi les accents du corps se perdent aussi', () => {
    const brut = decoder(encoderMessage(MAIL));
    expect(brut).toContain('Content-Type: text/plain; charset="UTF-8"');
  });
});

describe('createGmailClient — envoyer', () => {
  function fausseReponse(status: number, corps: unknown) {
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(corps),
      json: async () => corps,
    } as unknown as Response;
  }

  it('appelle l’API Gmail en Bearer et rend l’identifiant du message', async () => {
    const appels: { url: string; init?: RequestInit }[] = [];
    const fausseFetch = (async (url: string, init?: RequestInit) => {
      appels.push({ url, init });
      return fausseReponse(200, { id: '18f2c0a' });
    }) as unknown as typeof fetch;

    const client = createGmailClient({ jeton: 'ya29.xxx', fetch: fausseFetch });
    const r = await client.envoyer(MAIL);

    expect(r).toEqual({ ok: true, providerMessageId: '18f2c0a' });
    expect(appels[0]?.url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    expect(appels[0]?.init?.method).toBe('POST');
    const entetes = appels[0]?.init?.headers as Record<string, string>;
    expect(entetes.Authorization).toBe('Bearer ya29.xxx');
  });

  it('nomme « jeton » un 401 — le cas que l’écran doit savoir remédier', async () => {
    const fausseFetch = (async () =>
      fausseReponse(401, { error: { message: 'Invalid Credentials' } })) as unknown as typeof fetch;
    const client = createGmailClient({ jeton: 'perime', fetch: fausseFetch });
    const r = await client.envoyer(MAIL);
    expect(r).toEqual({ ok: false, motif: 'jeton', message: expect.any(String) });
  });

  it('nomme « quota » un 429 — le plafond quotidien, pas une panne', async () => {
    const fausseFetch = (async () =>
      fausseReponse(429, { error: { message: 'Rate Limit Exceeded' } })) as unknown as typeof fetch;
    const client = createGmailClient({ jeton: 'ya29.xxx', fetch: fausseFetch });
    const r = await client.envoyer(MAIL);
    expect((r as { motif: string }).motif).toBe('quota');
  });

  it('nomme « echec » tout le reste, en gardant le statut dans le message', async () => {
    const fausseFetch = (async () =>
      fausseReponse(500, { error: { message: 'Backend Error' } })) as unknown as typeof fetch;
    const client = createGmailClient({ jeton: 'ya29.xxx', fetch: fausseFetch });
    const r = await client.envoyer(MAIL);
    expect(r).toEqual({ ok: false, motif: 'echec', message: expect.stringContaining('500') });
  });
});
