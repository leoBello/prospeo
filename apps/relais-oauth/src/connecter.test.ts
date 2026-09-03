import { describe, expect, it } from 'vitest';
import { construireRedirection, type ConnecterDeps } from './connecter.js';

const LIENS = {
  githubInstallUrl: 'https://github.com/apps/prospeo-deploiement/installations/new',
  vercelInstallUrl: 'https://vercel.com/integrations/prospeo/new',
};

function deps(surcharges: Partial<ConnecterDeps> = {}): ConnecterDeps {
  return {
    proprietaireExiste: async () => true,
    signerState: () => 'state-signe-de-test',
    ...surcharges,
  };
}

describe('construireRedirection', () => {
  it('refuse une plateforme inconnue', async () => {
    const r = await construireRedirection(deps(), LIENS, 'autre-chose', 'owner-1');
    expect(r).toEqual({ ok: false, statut: 400, raison: expect.any(String) });
  });

  it('refuse un owner absent', async () => {
    const r = await construireRedirection(deps(), LIENS, 'github', undefined);
    expect(r).toEqual({ ok: false, statut: 400, raison: expect.any(String) });
  });

  it("refuse un owner qui n'existe pas", async () => {
    const r = await construireRedirection(deps({ proprietaireExiste: async () => false }), LIENS, 'github', 'inconnu');
    expect(r).toEqual({ ok: false, statut: 404, raison: expect.any(String) });
  });

  it('redirige vers GitHub avec le state signé', async () => {
    const r = await construireRedirection(deps(), LIENS, 'github', 'owner-1');
    expect(r).toEqual({
      ok: true,
      url: 'https://github.com/apps/prospeo-deploiement/installations/new?state=state-signe-de-test',
    });
  });

  it('redirige vers Vercel avec le state signé', async () => {
    const r = await construireRedirection(deps(), LIENS, 'vercel', 'owner-1');
    expect(r).toEqual({
      ok: true,
      url: 'https://vercel.com/integrations/prospeo/new?state=state-signe-de-test',
    });
  });
});
