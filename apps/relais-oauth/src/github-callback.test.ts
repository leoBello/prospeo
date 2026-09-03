import { describe, expect, it, vi } from 'vitest';
import { traiterRappelGithub, type GithubCallbackDeps } from './github-callback.js';
import type { ResultatState } from './state.js';

const ETAT_VALIDE: ResultatState = {
  ok: true,
  charge: { ownerId: 'owner-1', plateforme: 'github', exp: Date.now() + 60000 },
};

function deps(surcharges: Partial<GithubCallbackDeps> = {}): GithubCallbackDeps {
  return {
    verifierState: () => ETAT_VALIDE,
    lireInstallation: async () => ({ compteLibelle: 'mon-org' }),
    ecrireConnexion: async () => {},
    ...surcharges,
  };
}

describe('traiterRappelGithub', () => {
  it('refuse un state manquant', async () => {
    const r = await traiterRappelGithub(deps(), { installationId: '1', setupAction: 'install', state: undefined });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un state invalide', async () => {
    const r = await traiterRappelGithub(
      deps({ verifierState: () => ({ ok: false, raison: 'signature_invalide' }) }),
      { installationId: '1', setupAction: 'install', state: 'x' },
    );
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un state signé pour une AUTRE plateforme', async () => {
    const r = await traiterRappelGithub(
      deps({
        verifierState: () => ({ ok: true, charge: { ownerId: 'owner-1', plateforme: 'vercel', exp: Date.now() + 60000 } }),
      }),
      { installationId: '1', setupAction: 'install', state: 'x' },
    );
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse une action de setup inattendue', async () => {
    const r = await traiterRappelGithub(deps(), { installationId: '1', setupAction: 'request', state: 'x' });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un installation_id manquant', async () => {
    const r = await traiterRappelGithub(deps(), { installationId: undefined, setupAction: 'install', state: 'x' });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('écrit la connexion avec le libellé lu chez GitHub, sur succès', async () => {
    const ecrireConnexion = vi.fn(async () => {});
    const r = await traiterRappelGithub(deps({ ecrireConnexion }), {
      installationId: '999',
      setupAction: 'install',
      state: 'x',
    });
    expect(r).toEqual({ ok: true });
    expect(ecrireConnexion).toHaveBeenCalledWith('owner-1', '999', 'mon-org');
  });
});
