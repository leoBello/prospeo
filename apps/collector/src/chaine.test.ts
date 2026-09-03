import { describe, expect, it, vi } from 'vitest';
import { traiterProspect, type ChaineDeps } from './chaine.js';

function deps(surcharges: Partial<ChaineDeps> = {}): ChaineDeps {
  return {
    generer: async () => 0.02,
    publier: async () => {},
    deployer: async () => {},
    rediger: async () => 0.01,
    ...surcharges,
  };
}

describe('traiterProspect', () => {
  it('enchaine les quatre etapes dans l ordre', async () => {
    const ordre: string[] = [];
    await traiterProspect(
      'p-1',
      deps({
        generer: async () => {
          ordre.push('generate');
          return null;
        },
        publier: async () => {
          ordre.push('publish');
        },
        deployer: async () => {
          ordre.push('deploy');
        },
        rediger: async () => {
          ordre.push('pitch');
          return null;
        },
      }),
    );

    // L ordre est une dependance de donnees, pas une convention : publier
    // avant d avoir genere pousserait un depot vide.
    expect(ordre).toEqual(['generate', 'publish', 'deploy', 'pitch']);
  });

  it('s arrete au premier echec et nomme l etape fautive', async () => {
    const rediger = vi.fn(async () => null);
    const resultat = await traiterProspect(
      'p-1',
      deps({
        publier: async () => {
          throw new Error('nom deja pris');
        },
        rediger,
      }),
    );

    expect(resultat.echec).toEqual({ etape: 'publish', message: 'nom deja pris' });
    expect(resultat.termine).toEqual(['generate']);
    // Rediger un mail qui citerait une URL inexistante produirait un message
    // faux : la chaine s arrete, elle ne saute pas l etape.
    expect(rediger).not.toHaveBeenCalled();
  });

  it('somme les couts connus', async () => {
    const resultat = await traiterProspect('p-1', deps({ generer: async () => 0.02, rediger: async () => 0.01 }));

    expect(resultat.coutEur).toBeCloseTo(0.03, 5);
  });

  it('rend un cout nul quand aucune etape ne sait ce qu elle a coute', async () => {
    // `null` n est pas zero : « je ne sais pas » et « c etait gratuit » sont
    // deux faits differents, et l ecran doit pouvoir les distinguer.
    const resultat = await traiterProspect(
      'p-1',
      deps({ generer: async () => null, rediger: async () => null }),
    );

    expect(resultat.coutEur).toBeNull();
  });

  it('somme ce qui est connu meme quand une etape l ignore', async () => {
    const resultat = await traiterProspect(
      'p-1',
      deps({ generer: async () => 0.02, rediger: async () => null }),
    );

    // Un total partiel, pas un total faux. Traiter le `null` comme zero
    // sous-declarerait la depense sans que rien ne le signale.
    expect(resultat.coutEur).toBeCloseTo(0.02, 5);
  });
});
