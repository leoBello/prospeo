import { describe, expect, it, vi } from 'vitest';
import { chiffrer, lireCleMaitresse } from '@prospeo/coffre';
import { jetonDe, type CoffreDeps } from './coffre.js';
import { proprietaire } from './proprietaire.js';

/** Trente-deux octets, la taille exacte d'une clé AES-256. */
const CLE = lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64'));

describe('jetonDe', () => {
  const PROPRIETAIRE = proprietaire('131ab48e-055a-4a15-af4b-79ed7a2e4465');

  function deps(surcharges: Partial<CoffreDeps> = {}): CoffreDeps {
    return {
      lireConnexion: async () => null,
      lireSecret: async () => null,
      marquerEtat: async () => {},
      cle: CLE,
      ...surcharges,
    };
  }

  it('rend absente quand aucune connexion n existe pour cette plateforme', async () => {
    const lireSecret = vi.fn();
    const marquerEtat = vi.fn();
    const r = await jetonDe(deps({ lireSecret, marquerEtat }), PROPRIETAIRE, 'vercel');

    expect(r).toEqual({ jeton: null, etat: 'absente' });
    expect(lireSecret).not.toHaveBeenCalled();
    expect(marquerEtat).not.toHaveBeenCalled();
  });

  it('ne lit pas le secret d une connexion revoquee, et rend son etat tel quel', async () => {
    const lireSecret = vi.fn();
    const r = await jetonDe(
      deps({
        lireConnexion: async () => ({ id: 'cx-1', etat: 'revoquee' }),
        lireSecret,
      }),
      PROPRIETAIRE,
      'vercel',
    );

    expect(r).toEqual({ jeton: null, etat: 'revoquee' });
    expect(lireSecret).not.toHaveBeenCalled();
  });

  it('marque indechiffrable en base quand le secret d une connexion active ne se dechiffre pas', async () => {
    const autreCle = lireCleMaitresse('v2:' + Buffer.alloc(32, 9).toString('base64'));
    const scelleIllisible = chiffrer('jeton-vercel-secret', autreCle);
    const marquerEtat = vi.fn(async () => {});

    const r = await jetonDe(
      deps({
        lireConnexion: async () => ({ id: 'cx-1', etat: 'active' }),
        lireSecret: async () => scelleIllisible,
        marquerEtat,
      }),
      PROPRIETAIRE,
      'vercel',
    );

    expect(r).toEqual({ jeton: null, etat: 'indechiffrable' });
    expect(marquerEtat).toHaveBeenCalledWith('cx-1', 'indechiffrable');
    expect(marquerEtat).toHaveBeenCalledTimes(1);
  });

  it('rend le jeton d une connexion active dechiffrable, sans aucune ecriture', async () => {
    const scelle = chiffrer('jeton-vercel-secret', CLE);
    const marquerEtat = vi.fn(async () => {});

    const r = await jetonDe(
      deps({
        lireConnexion: async () => ({ id: 'cx-1', etat: 'active' }),
        lireSecret: async () => scelle,
        marquerEtat,
      }),
      PROPRIETAIRE,
      'vercel',
    );

    expect(r).toEqual({ jeton: 'jeton-vercel-secret' });
    expect(marquerEtat).not.toHaveBeenCalled();
  });

  it('le jeton dechiffre ne fuit jamais dans un message d erreur, meme d un appel ulterieur', async () => {
    const scelle = chiffrer('jeton-vercel-secret-a-ne-jamais-relire', CLE);
    const ok = await jetonDe(
      deps({
        lireConnexion: async () => ({ id: 'cx-1', etat: 'active' }),
        lireSecret: async () => scelle,
      }),
      PROPRIETAIRE,
      'vercel',
    );
    expect(ok).toEqual({ jeton: 'jeton-vercel-secret-a-ne-jamais-relire' });

    let echecCapture: unknown;
    try {
      await jetonDe(
        deps({
          lireConnexion: async () => {
            throw new Error('panne reseau pendant la lecture de connexion_plateforme');
          },
        }),
        PROPRIETAIRE,
        'vercel',
      );
    } catch (e) {
      echecCapture = e;
    }

    expect(echecCapture).toBeInstanceOf(Error);
    expect((echecCapture as Error).message).not.toContain(
      'jeton-vercel-secret-a-ne-jamais-relire',
    );
  });
});
