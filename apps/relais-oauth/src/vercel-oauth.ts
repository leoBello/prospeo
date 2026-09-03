/**
 * L'échange OAuth de Vercel : un `code`, valable 30 minutes et une seule
 * fois, contre un jeton d'accès durable — documenté par Vercel comme un
 * POST `application/x-www-form-urlencoded`, pas un JSON.
 */

const BASE = 'https://api.vercel.com';

export interface VercelOAuthOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
}

export interface JetonVercel {
  accessToken: string;
  /** `null` sur un compte personnel sans équipe. */
  teamId: string | null;
}

export function createVercelOAuthClient(options: VercelOAuthOptions): {
  echangerCode(code: string, redirectUri: string): Promise<JetonVercel>;
} {
  const appeler = options.fetch ?? fetch;
  return {
    async echangerCode(code, redirectUri) {
      const corps = new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        code,
        redirect_uri: redirectUri,
      });
      const reponse = await appeler(`${BASE}/v2/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: corps.toString(),
      });
      if (!reponse.ok) {
        const texte = await reponse.text().catch(() => '');
        throw new Error(`Vercel : échange du code — ${reponse.status} — ${texte}`);
      }
      const json = (await reponse.json()) as { access_token: string; team_id: string | null };
      return { accessToken: json.access_token, teamId: json.team_id ?? null };
    },
  };
}
