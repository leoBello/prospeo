import { createSign } from 'node:crypto';

/**
 * L'authentification d'une GitHub App — un JWT signé par sa clé privée,
 * échangé contre un jeton d'accès sur une installation précise.
 *
 * Duplication délibérée de `apps/relais-oauth/src/github.ts` (voir le
 * commentaire d'en-tête de ce fichier) : aucune bibliothèque cliente, trois
 * champs, une signature.
 */

const BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/** Neuf minutes : sous la limite des dix minutes que GitHub tolère pour un
 *  JWT d'App, avec une marge pour une horloge locale imprécise. */
const DUREE_JWT_S = 9 * 60;

function base64url(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}

export function signerJwtApp(appId: string, clePrivee: string, maintenant: Date = new Date()): string {
  const iat = Math.floor(maintenant.getTime() / 1000) - 60; // 60s de marge, horloge en avance
  const aSigner = `${base64url({ alg: 'RS256', typ: 'JWT' })}.${base64url({ iat, exp: iat + DUREE_JWT_S, iss: appId })}`;
  const signature = createSign('RSA-SHA256').update(aSigner).sign(clePrivee, 'base64url');
  return `${aSigner}.${signature}`;
}

export interface GithubAppOptions {
  appId: string;
  clePrivee: string;
  fetch?: typeof fetch;
}

export type ResultatJetonInstallation =
  | { ok: true; token: string }
  | { ok: false; motif: 'revoquee' | 'echec'; message: string };

export function createGithubAppClient(options: GithubAppOptions): {
  creerJetonInstallation(installationId: string): Promise<ResultatJetonInstallation>;
} {
  const appeler = options.fetch ?? fetch;
  return {
    async creerJetonInstallation(installationId) {
      const jwt = signerJwtApp(options.appId, options.clePrivee);
      const reponse = await appeler(`${BASE}/app/installations/${installationId}/access_tokens`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': API_VERSION,
        },
      });
      // 401/404 : GitHub refuse de reconnaître l'installation — supprimée ou
      // suspendue. À distinguer d'une panne transitoire (5xx, réseau) : la
      // première justifie de marquer la connexion `revoquee` en base, la
      // seconde non — un blip réseau ne doit jamais faire perdre une
      // connexion saine.
      if (reponse.status === 401 || reponse.status === 404) {
        const corps = await reponse.text().catch(() => '');
        return {
          ok: false,
          motif: 'revoquee',
          message: `GitHub : jeton d'installation ${installationId} — ${reponse.status} — ${corps}`,
        };
      }
      if (!reponse.ok) {
        const corps = await reponse.text().catch(() => '');
        return {
          ok: false,
          motif: 'echec',
          message: `GitHub : jeton d'installation ${installationId} — ${reponse.status} — ${corps}`,
        };
      }
      const corps = (await reponse.json()) as { token: string };
      return { ok: true, token: corps.token };
    },
  };
}
