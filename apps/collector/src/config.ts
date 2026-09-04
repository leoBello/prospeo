import { z } from 'zod';
import { lireCleMaitresse, type CleMaitresse } from '@prospeo/coffre';

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

export interface Config {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

export function loadConfig(env: NodeJS.ProcessEnv): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Configuration invalide ou incomplète : ${missing}`);
  }
  return {
    supabaseUrl: parsed.data.SUPABASE_URL,
    supabaseServiceRoleKey: parsed.data.SUPABASE_SERVICE_ROLE_KEY,
  };
}

/**
 * Les secrets de la chaîne de vente, lus par étage.
 *
 * **Trois loaders et non un seul.** Un `publish` refusé parce que
 * `ANTHROPIC_API_KEY` manque envoie chercher un problème qui n'a rien à voir,
 * et fait perdre un run. Les étages sont indépendants — on peut publier sans
 * jamais générer, en rejouant un contenu déjà en base — donc leurs exigences
 * le sont aussi.
 *
 * **Aucune de ces variables n'est préfixée `VITE_`**, et ce n'est pas une
 * convention de nommage : Vite inline en clair dans le bundle du dashboard
 * tout ce qui porte ce préfixe. Ces secrets ne sont lus que par le collector,
 * qui tourne sur la machine de l'opérateur.
 */

/** Rend la valeur nettoyée, ou `undefined` si elle est absente ou vide. */
function lire(env: Record<string, string | undefined>, nom: string): string | undefined {
  const brut = env[nom]?.trim();
  return brut === undefined || brut === '' ? undefined : brut;
}

/**
 * Échoue en nommant TOUTES les variables manquantes.
 *
 * Les révéler une par une impose autant d'allers-retours qu'il en manque, et
 * chacun coûte un run — défaut que `enrich` a déjà connu.
 */
function exiger(
  env: Record<string, string | undefined>,
  noms: readonly string[],
  etage: string,
): Record<string, string> {
  const valeurs: Record<string, string> = {};
  const manquantes: string[] = [];
  for (const nom of noms) {
    const valeur = lire(env, nom);
    if (valeur === undefined) manquantes.push(nom);
    else valeurs[nom] = valeur;
  }
  if (manquantes.length > 0) {
    throw new Error(
      `Configuration incomplète pour l'étage « ${etage} » :\n` +
        manquantes.map((n) => `  - ${n}`).join('\n') +
        '\nVoir .env.example.',
    );
  }
  return valeurs;
}

export interface GenerateConfig {
  anthropicApiKey: string;
  /**
   * Requis seulement si la clé est rattachée à un workspace — ce qui est le
   * cas quand on lui a fixé un plafond de dépense, la seule protection
   * disponible sur une clé Anthropic. L'API refuse alors par un 400 toute
   * requête qui ne le déclare pas.
   */
  anthropicWorkspaceId: string | undefined;
}

/**
 * Les deux étages qui appellent le modèle lisent les MÊMES variables, et
 * doivent pourtant se nommer eux-mêmes en échouant.
 *
 * C'est la raison d'être des loaders par étage : le message doit dire quelle
 * commande a échoué, pas seulement laquelle des trois familles de secrets
 * manque. Un opérateur qui lance `pitch` et lit « étage generate » cherche
 * d'abord ce qu'il a fait de travers à l'étage précédent.
 */
function chargerModele(env: Record<string, string | undefined>, etage: string): GenerateConfig {
  const v = exiger(env, ['ANTHROPIC_API_KEY'], etage);
  return {
    anthropicApiKey: v['ANTHROPIC_API_KEY'] as string,
    anthropicWorkspaceId: lire(env, 'ANTHROPIC_WORKSPACE_ID'),
  };
}

export function loadGenerateConfig(env: Record<string, string | undefined>): GenerateConfig {
  return chargerModele(env, 'generate');
}

/** Mêmes secrets que `generate` : c'est le même modèle qu'on appelle. */
export function loadPitchConfig(env: Record<string, string | undefined>): GenerateConfig {
  return chargerModele(env, 'pitch');
}

export interface PublishConfig {
  githubToken: string;
  githubOrg: string;
  /**
   * Dépôt modèle de REPLI. `trades.ts` porte un modèle par métier, qui prime :
   * le rendre obligatoire ici forcerait une valeur globale que rien ne lit
   * quand tous les métiers déclarent le leur.
   */
  githubTemplateRepo: string | undefined;
}

export function loadPublishConfig(env: Record<string, string | undefined>): PublishConfig {
  const v = exiger(env, ['GITHUB_TOKEN', 'PROSPEO_GITHUB_ORG'], 'publish');
  return {
    githubToken: v['GITHUB_TOKEN'] as string,
    githubOrg: v['PROSPEO_GITHUB_ORG'] as string,
    githubTemplateRepo: lire(env, 'PROSPEO_GITHUB_TEMPLATE_REPO'),
  };
}

export interface DeployConfig {
  vercelToken: string;
  /** Vide sur un compte personnel sans équipe : l'exiger refuserait ce cas. */
  vercelTeamId: string | undefined;
}

export function loadDeployConfig(env: Record<string, string | undefined>): DeployConfig {
  const v = exiger(env, ['VERCEL_TOKEN'], 'deploy');
  return {
    vercelToken: v['VERCEL_TOKEN'] as string,
    vercelTeamId: lire(env, 'PROSPEO_VERCEL_TEAM'),
  };
}

export interface CoffreConfig {
  cle: CleMaitresse;
}

/**
 * `lireCleMaitresse` valide déjà le format et se nomme déjà en échouant
 * (voir `coffre.ts`) : `exiger` ferait double emploi, ce loader ne fait donc
 * que la brancher sur l'environnement — même rôle que les autres, forme
 * légèrement différente parce que la validation vit ailleurs.
 */
export function loadCoffreConfig(env: Record<string, string | undefined>): CoffreConfig {
  return { cle: lireCleMaitresse(lire(env, 'PROSPEO_COFFRE_CLE')) };
}

export interface GithubAppConfig {
  appId: string;
  clePrivee: string;
}

/**
 * Les secrets de l'App GitHub, dupliqués depuis l'environnement du relais
 * (`apps/relais-oauth`) : le worker en a besoin pour fabriquer ses propres
 * jetons d'installation (chantier n°8, étape suivant le relais OAuth).
 */
export function loadGithubAppConfig(env: Record<string, string | undefined>): GithubAppConfig {
  const v = exiger(env, ['PROSPEO_GITHUB_APP_ID', 'PROSPEO_GITHUB_APP_PRIVATE_KEY'], 'worker');
  return {
    appId: v['PROSPEO_GITHUB_APP_ID'] as string,
    // Même restauration que `loadRelaisConfig` (`apps/relais-oauth/src/
    // config.ts`) : un PEM porte de vrais sauts de ligne, une variable
    // d'environnement les perd souvent en route.
    clePrivee: (v['PROSPEO_GITHUB_APP_PRIVATE_KEY'] as string).replace(/\\n/g, '\n'),
  };
}

export interface GithubTemplateConfig {
  githubTemplateRepo: string | undefined;
}

/**
 * Le seul réglage que `chaineDeps` partage encore avec `loadPublishConfig` :
 * le dépôt modèle de repli. Un loader à part, et non `loadPublishConfig`
 * lui-même, parce que celui-ci EXIGE `GITHUB_TOKEN`/`PROSPEO_GITHUB_ORG` —
 * des secrets globaux que `chaineDeps` ne lit plus (Tâche 6).
 */
export function loadGithubTemplateConfig(env: Record<string, string | undefined>): GithubTemplateConfig {
  return { githubTemplateRepo: lire(env, 'PROSPEO_GITHUB_TEMPLATE_REPO') };
}
