import { lireCleMaitresse, type CleMaitresse } from './coffre.js';

/**
 * Les onze variables du relais, exigées d'un coup — comme `exiger` dans
 * `apps/collector/src/config.ts`, pour qu'un déploiement mal configuré
 * échoue en nommant TOUT ce qui manque, pas une variable à la fois.
 */
export interface RelaisConfig {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  coffreCle: CleMaitresse;
  oauthStateSecret: string;
  githubAppId: string;
  githubAppPrivateKey: string;
  githubInstallUrl: string;
  vercelOAuthClientId: string;
  vercelOAuthClientSecret: string;
  vercelInstallUrl: string;
  vercelRedirectUri: string;
}

const VARIABLES = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'PROSPEO_COFFRE_CLE',
  'PROSPEO_OAUTH_STATE_SECRET',
  'PROSPEO_GITHUB_APP_ID',
  'PROSPEO_GITHUB_APP_PRIVATE_KEY',
  'PROSPEO_GITHUB_INSTALL_URL',
  'PROSPEO_VERCEL_OAUTH_CLIENT_ID',
  'PROSPEO_VERCEL_OAUTH_CLIENT_SECRET',
  'PROSPEO_VERCEL_INSTALL_URL',
  'PROSPEO_VERCEL_REDIRECT_URI',
] as const;

export function loadRelaisConfig(env: Record<string, string | undefined>): RelaisConfig {
  const manquantes = VARIABLES.filter((n) => env[n] === undefined || env[n] === '');
  if (manquantes.length > 0) {
    throw new Error(`Configuration incomplète :\n${manquantes.map((n) => `  - ${n}`).join('\n')}`);
  }
  const v = (nom: (typeof VARIABLES)[number]): string => env[nom] as string;
  return {
    supabaseUrl: v('SUPABASE_URL'),
    supabaseServiceRoleKey: v('SUPABASE_SERVICE_ROLE_KEY'),
    coffreCle: lireCleMaitresse(v('PROSPEO_COFFRE_CLE')),
    oauthStateSecret: v('PROSPEO_OAUTH_STATE_SECRET'),
    githubAppId: v('PROSPEO_GITHUB_APP_ID'),
    // Un PEM porte de vrais sauts de ligne ; une variable d'environnement les
    // perd souvent en route. `\n` littéral (deux caractères) est donc rétabli
    // en vrai saut de ligne ici plutôt que de contraindre CHAQUE plateforme
    // d'hébergement à préserver un PEM multi-lignes tel quel.
    githubAppPrivateKey: v('PROSPEO_GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n'),
    githubInstallUrl: v('PROSPEO_GITHUB_INSTALL_URL'),
    vercelOAuthClientId: v('PROSPEO_VERCEL_OAUTH_CLIENT_ID'),
    vercelOAuthClientSecret: v('PROSPEO_VERCEL_OAUTH_CLIENT_SECRET'),
    vercelInstallUrl: v('PROSPEO_VERCEL_INSTALL_URL'),
    vercelRedirectUri: v('PROSPEO_VERCEL_REDIRECT_URI'),
  };
}
