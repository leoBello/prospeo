import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  loadCoffreConfig,
  loadDeployConfig,
  loadGithubAppConfig,
  loadGithubTemplateConfig,
  loadPitchConfig,
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

describe('loadCoffreConfig', () => {
  const cleValide = `v1:${randomBytes(32).toString('base64')}`;

  it('refuse de démarrer si PROSPEO_COFFRE_CLE manque', () => {
    // Le nom de la variable doit apparaître dans le message : c'est lui qui
    // évite à l'opérateur de deviner laquelle des deux dizaines de variables
    // d'environnement a été oubliée.
    expect(() => loadCoffreConfig({})).toThrow(/PROSPEO_COFFRE_CLE/);
  });

  it('lit une clé maîtresse bien formée', () => {
    const config = loadCoffreConfig({ PROSPEO_COFFRE_CLE: cleValide });
    expect(config.cle.id).toBe('v1');
    expect(config.cle.octets).toHaveLength(32);
  });
});

describe('loadGithubAppConfig', () => {
  it('exige PROSPEO_GITHUB_APP_ID et PROSPEO_GITHUB_APP_PRIVATE_KEY', () => {
    expect(() => loadGithubAppConfig({})).toThrow(/PROSPEO_GITHUB_APP_ID/);
  });

  it('restaure les sauts de ligne littéraux \\n du PEM', () => {
    const config = loadGithubAppConfig({
      PROSPEO_GITHUB_APP_ID: '123456',
      PROSPEO_GITHUB_APP_PRIVATE_KEY: '-----BEGIN RSA PRIVATE KEY-----\\nABC\\n-----END RSA PRIVATE KEY-----',
    });
    expect(config.appId).toBe('123456');
    expect(config.clePrivee).toBe('-----BEGIN RSA PRIVATE KEY-----\nABC\n-----END RSA PRIVATE KEY-----');
  });
});

describe('loadGithubTemplateConfig', () => {
  it('rend undefined quand PROSPEO_GITHUB_TEMPLATE_REPO est absent', () => {
    expect(loadGithubTemplateConfig({}).githubTemplateRepo).toBeUndefined();
  });

  it('rend la valeur quand elle est presente', () => {
    expect(loadGithubTemplateConfig({ PROSPEO_GITHUB_TEMPLATE_REPO: 'mon-modele' }).githubTemplateRepo).toBe(
      'mon-modele',
    );
  });
});

describe('loadPitchConfig', () => {
  it('lit les mêmes secrets que generate', () => {
    const c = loadPitchConfig({ ANTHROPIC_API_KEY: 'sk-x', ANTHROPIC_WORKSPACE_ID: 'w' });
    expect(c).toEqual({ anthropicApiKey: 'sk-x', anthropicWorkspaceId: 'w' });
  });

  it('se nomme lui-même en échouant', () => {
    // Les deux étages lisent la même variable, mais un opérateur qui lance
    // `pitch` et lit « étage generate » cherche d'abord ce qu'il a raté à
    // l'étage précédent. Le message doit désigner la commande qu'on a tapée.
    expect(() => loadPitchConfig({})).toThrow(/pitch/);
    expect(() => loadPitchConfig({})).toThrow(/ANTHROPIC_API_KEY/);
  });
});
