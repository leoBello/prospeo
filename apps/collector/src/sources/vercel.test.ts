import { describe, expect, it } from 'vitest';
import { createVercelClient } from './vercel.js';

function faussetch(reponses: { status: number; body?: unknown }[]) {
  const appels: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const fn = async (url: string, init: RequestInit = {}) => {
    appels.push({ url, init });
    const r = reponses[Math.min(i++, reponses.length - 1)] ?? { status: 200 };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => JSON.stringify(r.body ?? {}),
      json: async () => r.body ?? {},
    } as unknown as Response;
  };
  return { fn: fn as unknown as typeof fetch, appels };
}

describe('createVercelClient', () => {
  it('raccorde le projet au dépôt et déclare le cadre applicatif', async () => {
    const { fn, appels } = faussetch([{ status: 200, body: { id: 'prj_1', name: 'dos' } }]);
    const r = await createVercelClient({ token: 't', fetch: fn }).creerProjet(
      'dos',
      'prospeo-sites/dos-51000900400035',
    );

    const corps = JSON.parse(String(appels[0]?.init.body));
    expect(corps.gitRepository).toEqual({
      type: 'github',
      repo: 'prospeo-sites/dos-51000900400035',
    });
    // Déclaré plutôt que deviné : une détection ratée produit un build vide
    // déployé SANS ERREUR — une page blanche en ligne au nom d'une entreprise
    // réelle, ce qui est pire qu'un échec franc.
    expect(corps.framework).toBe('astro');
    expect(r).toEqual({ id: 'prj_1', name: 'dos' });
  });

  it("n'envoie le paramètre d'équipe que s'il est renseigné", async () => {
    // Un `teamId=` vide n'est pas neutre : Vercel le lit comme une équipe
    // nommée « chaîne vide » et répond 403. Or `.env.example` documente que la
    // variable RESTE vide sur un compte personnel — c'est donc le cas normal,
    // pas le cas limite.
    const sans = faussetch([{ status: 200, body: { id: 'p', name: 'n' } }]);
    await createVercelClient({ token: 't', teamId: '', fetch: sans.fn }).creerProjet('n', 'o/r');
    expect(sans.appels[0]?.url).toBe('https://api.vercel.com/v11/projects');

    const avec = faussetch([{ status: 200, body: { id: 'p', name: 'n' } }]);
    await createVercelClient({ token: 't', teamId: 'team_x', fetch: avec.fn }).creerProjet(
      'n',
      'o/r',
    );
    expect(avec.appels[0]?.url).toBe('https://api.vercel.com/v11/projects?teamId=team_x');
  });

  it("rend l'URL de production quand le déploiement est prêt", async () => {
    const { fn } = faussetch([
      { status: 200, body: { targets: { production: { url: 'dos.vercel.app', readyState: 'READY' } } } },
    ]);
    expect(await createVercelClient({ token: 't', fetch: fn }).urlProduction('dos')).toBe(
      'https://dos.vercel.app',
    );
  });

  it("ne rend aucune URL tant que le déploiement n'est pas prêt", async () => {
    // Un déploiement en cours ou en erreur porte DÉJÀ une `url`. La stocker
    // ferait partir dans un email l'adresse d'une page qui n'existe pas
    // encore — ou qui n'existera jamais. C'est la donnée de vente : elle doit
    // être vraie au moment où on l'écrit.
    for (const readyState of ['BUILDING', 'ERROR', 'QUEUED', 'CANCELED']) {
      const { fn } = faussetch([
        { status: 200, body: { targets: { production: { url: 'dos.vercel.app', readyState } } } },
      ]);
      expect(await createVercelClient({ token: 't', fetch: fn }).urlProduction('dos')).toBeNull();
    }
  });

  it("rend null sur un projet sans production, et sur un projet absent", async () => {
    const sansCible = faussetch([{ status: 200, body: { targets: null } }]);
    expect(
      await createVercelClient({ token: 't', fetch: sansCible.fn }).urlProduction('dos'),
    ).toBeNull();

    const absent = faussetch([{ status: 404 }]);
    expect(await createVercelClient({ token: 't', fetch: absent.fn }).urlProduction('x')).toBeNull();
  });

  it('tient une suppression pour acquise quand le projet a déjà disparu', async () => {
    // D5 : la dépublication sur refus doit aboutir, y compris si un run
    // précédent avait fait le travail à moitié. Traiter 404 comme une erreur
    // laisserait un prospect `ne_pas_contacter` en échec perpétuel, et le
    // décompte d'échecs finirait par être ignoré.
    const { fn } = faussetch([{ status: 404 }]);
    await expect(
      createVercelClient({ token: 't', fetch: fn }).supprimerProjet('dos'),
    ).resolves.toBeUndefined();
  });

  it('remonte une erreur HTTP avec son code et son corps', async () => {
    // 403 signale le plus souvent que l'application GitHub de Vercel n'est pas
    // installée sur l'organisation dédiée — un prérequis manuel qu'aucune
    // ligne de code ne peut satisfaire. Le message doit permettre de le voir.
    const { fn } = faussetch([{ status: 403, body: { error: { message: 'not authorized' } } }]);
    await expect(
      createVercelClient({ token: 't', fetch: fn }).creerProjet('d', 'o/r'),
    ).rejects.toThrow(/403.*not authorized/s);
  });
});
