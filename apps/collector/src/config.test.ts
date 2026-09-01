import { describe, expect, it } from 'vitest';
import {
  loadDeployConfig,
  loadGenerateConfig,
  loadPublishConfig,
  loadConfig,
} from './config.js';


describe('loadConfig', () => {
  it('lit une configuration complete', () => {
    const config = loadConfig({
      SUPABASE_URL: 'https://x.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'secret',
    });
    expect(config.supabaseUrl).toBe('https://x.supabase.co');
    expect(config.supabaseServiceRoleKey).toBe('secret');
  });

  it('echoue avec un message explicite si une variable manque', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'https://x.supabase.co' })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    );
  });

  it('refuse une URL invalide', () => {
    expect(() => loadConfig({ SUPABASE_URL: 'pas-une-url', SUPABASE_SERVICE_ROLE_KEY: 'k' })).toThrow();
  });
});

describe('configuration de la chaîne de vente', () => {
  const complet = {
    ANTHROPIC_API_KEY: 'sk-ant-api03-xxx',
    ANTHROPIC_WORKSPACE_ID: 'wrkspc_xxx',
    GITHUB_TOKEN: 'github_pat_xxx',
    PROSPEO_GITHUB_ORG: 'prospeo',
    PROSPEO_GITHUB_TEMPLATE_REPO: 'plombier',
    VERCEL_TOKEN: 'vcp_xxx',
    PROSPEO_VERCEL_TEAM: 'team_xxx',
  };

  it("n'exige de chaque étage que ses propres secrets", () => {
    // Trois loaders et non un seul, et ce n'est pas de la coquetterie : un
    // `publish` refusé parce qu'ANTHROPIC_API_KEY manque envoie chercher un
    // problème qui n'a rien à voir. Les étages sont indépendants, leurs
    // exigences aussi.
    const sansAnthropic = { ...complet, ANTHROPIC_API_KEY: '' };
    expect(() => loadPublishConfig(sansAnthropic)).not.toThrow();
    expect(() => loadDeployConfig(sansAnthropic)).not.toThrow();
    expect(() => loadGenerateConfig(sansAnthropic)).toThrow(/ANTHROPIC_API_KEY/);

    const sansGithub = { ...complet, GITHUB_TOKEN: '' };
    expect(() => loadGenerateConfig(sansGithub)).not.toThrow();
    expect(() => loadPublishConfig(sansGithub)).toThrow(/GITHUB_TOKEN/);
  });

  it("nomme TOUTES les variables manquantes d'un coup", () => {
    // Les révéler une par une impose autant d'allers-retours qu'il en manque,
    // et chacun coûte un run. `enrich` avait déjà ce défaut avant qu'on le
    // corrige.
    const vide = {};
    expect(() => loadPublishConfig(vide)).toThrow(/GITHUB_TOKEN[\s\S]*PROSPEO_GITHUB_ORG/);
  });

  it('accepte un identifiant de workspace et une équipe absents', () => {
    // `ANTHROPIC_WORKSPACE_ID` n'est requis que si la clé est rattachée à un
    // workspace ; `PROSPEO_VERCEL_TEAM` reste vide sur un compte personnel.
    // Les rendre obligatoires refuserait des configurations parfaitement
    // valides.
    const g = loadGenerateConfig({ ...complet, ANTHROPIC_WORKSPACE_ID: '' });
    expect(g.anthropicWorkspaceId).toBeUndefined();
    const d = loadDeployConfig({ ...complet, PROSPEO_VERCEL_TEAM: '' });
    expect(d.vercelTeamId).toBeUndefined();
  });

  it('laisse le dépôt modèle indéfini, pour que le métier tranche', () => {
    // `PROSPEO_GITHUB_TEMPLATE_REPO` n'est qu'un REPLI : `trades.ts` porte un
    // modèle par métier, qui prime. Le rendre obligatoire ici forcerait une
    // valeur globale que rien ne lit quand tous les métiers déclarent le leur.
    const p = loadPublishConfig({ ...complet, PROSPEO_GITHUB_TEMPLATE_REPO: '' });
    expect(p.githubTemplateRepo).toBeUndefined();
    expect(p.githubOrg).toBe('prospeo');
  });
});
