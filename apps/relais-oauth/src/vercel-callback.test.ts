import { describe, expect, it, vi } from 'vitest';
import { lireCleMaitresse, type Scelle } from './coffre.js';
import { traiterRappelVercel, type VercelCallbackDeps } from './vercel-callback.js';
import type { ResultatState } from './state.js';

const CLE = lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64'));

const ETAT_VALIDE: ResultatState = {
  ok: true,
  charge: { ownerId: 'owner-1', plateforme: 'vercel', exp: Date.now() + 60000 },
};

function deps(surcharges: Partial<VercelCallbackDeps> = {}): VercelCallbackDeps {
  return {
    verifierState: () => ETAT_VALIDE,
    echangerCode: async () => ({ accessToken: 'jeton-vercel-en-clair', teamId: 'team_x' }),
    ecrireConnexion: async () => {},
    cle: CLE,
    redirectUri: 'https://relais.example/api/vercel/callback',
    ...surcharges,
  };
}

describe('traiterRappelVercel', () => {
  it('refuse un state manquant', async () => {
    const r = await traiterRappelVercel(deps(), { code: 'c1', state: undefined });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un state invalide', async () => {
    const r = await traiterRappelVercel(deps({ verifierState: () => ({ ok: false, raison: 'expire' }) }), {
      code: 'c1',
      state: 'x',
    });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un state signé pour une AUTRE plateforme', async () => {
    const r = await traiterRappelVercel(
      deps({
        verifierState: () => ({ ok: true, charge: { ownerId: 'owner-1', plateforme: 'github', exp: Date.now() + 60000 } }),
      }),
      { code: 'c1', state: 'x' },
    );
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('refuse un code manquant', async () => {
    const r = await traiterRappelVercel(deps(), { code: undefined, state: 'x' });
    expect(r).toEqual({ ok: false, raison: expect.any(String) });
  });

  it('chiffre le jeton avant de l écrire, jamais en clair', async () => {
    const ecrireConnexion = vi.fn(async (_ownerId: string, _compteLibelle: string, _scelle: Scelle) => {});
    const r = await traiterRappelVercel(deps({ ecrireConnexion }), { code: 'c1', state: 'x' });

    expect(r).toEqual({ ok: true });
    expect(ecrireConnexion).toHaveBeenCalledTimes(1);
    const [ownerId, compteLibelle, scelle] = ecrireConnexion.mock.calls[0] as [string, string, { chiffre: Buffer }];
    expect(ownerId).toBe('owner-1');
    expect(compteLibelle).toBe('team_x');
    expect(scelle.chiffre.toString('utf8')).not.toContain('jeton-vercel-en-clair');
  });

  it('nomme le compte « compte personnel » quand teamId est nul', async () => {
    const ecrireConnexion = vi.fn(async (_ownerId: string, _compteLibelle: string, _scelle: Scelle) => {});
    await traiterRappelVercel(
      deps({ echangerCode: async () => ({ accessToken: 'x', teamId: null }), ecrireConnexion }),
      { code: 'c1', state: 'x' },
    );
    const [, compteLibelle] = ecrireConnexion.mock.calls[0] as [string, string, Scelle];
    expect(compteLibelle).toBe('compte personnel');
  });

  it('rend un échec générique — jamais ne lève — quand Vercel refuse l échange de code (R5)', async () => {
    await expect(
      traiterRappelVercel(
        deps({
          echangerCode: async () => {
            throw new Error('Vercel a répondu 401 : { "error": "invalid_grant" }');
          },
        }),
        { code: 'c1', state: 'x' },
      ),
    ).resolves.toEqual({ ok: false, raison: expect.any(String) });
  });
});
