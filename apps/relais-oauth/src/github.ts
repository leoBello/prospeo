import { createSign } from 'node:crypto';

/**
 * L'authentification d'une GitHub App — un JWT signé par sa clé privée,
 * échangé contre un accès à une installation précise.
 *
 * Aucune bibliothèque cliente : trois champs, une signature. Même choix que
 * `apps/collector/src/sources/github.ts`, qui préfère `fetch` à Octokit pour
 * garder le contrôle exact des en-têtes et des corps.
 */

const BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

/** Neuf minutes : sous la limite des dix minutes que GitHub tolère pour un
 *  JWT d'App, avec une marge pour une horloge locale imprécise. */
const DUREE_JWT_S = 9 * 60;

function base64url(o: unknown): string {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}

/**
 * Signe un JWT RS256 minimal pour s'authentifier en tant qu'App (pas en tant
 * qu'installation) — c'est ce jeton qui permet d'interroger
 * `/app/installations/{id}`, avant même d'avoir un jeton d'installation.
 */
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

export interface InstallationGithub {
  compteLibelle: string;
}

export function createGithubAppClient(options: GithubAppOptions): {
  lireInstallation(installationId: string): Promise<InstallationGithub>;
} {
  const appeler = options.fetch ?? fetch;
  return {
    async lireInstallation(installationId) {
      const jwt = signerJwtApp(options.appId, options.clePrivee);
      const reponse = await appeler(`${BASE}/app/installations/${installationId}`, {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': API_VERSION,
        },
      });
      if (!reponse.ok) {
        const corps = await reponse.text().catch(() => '');
        throw new Error(
          `GitHub : lecture de l'installation ${installationId} — ${reponse.status} — ${corps}`,
        );
      }
      const corps = (await reponse.json()) as { account: { login: string } };
      return { compteLibelle: corps.account.login };
    },
  };
}
