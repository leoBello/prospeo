import { describe, expect, it, vi } from 'vitest';
import { chiffrer, dechiffrer, jetonDe, lireCleMaitresse, type CoffreDeps } from './coffre.js';
import { proprietaire } from './proprietaire.js';

/** Trente-deux octets, la taille exacte d'une clé AES-256. */
const CLE = lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64'));

describe('lireCleMaitresse', () => {
  it('refuse une cle absente, plutot que de laisser demarrer sans coffre', () => {
    // Un collector qui demarre sans cle echouerait au PREMIER job, une fois
    // qu il aurait deja cree un depot GitHub. L echec doit venir avant.
    expect(() => lireCleMaitresse(undefined)).toThrow();
  });

  it('refuse une cle qui n a pas la bonne taille', () => {
    // AES-256 exige exactement 32 octets. Une cle plus courte ferait lever
    // `crypto` au premier chiffrement, avec un message qui ne dirait pas d ou
    // vient le probleme.
    expect(() => lireCleMaitresse('v1:' + Buffer.alloc(16, 7).toString('base64'))).toThrow();
  });

  it('porte un identifiant de cle, pour qu une rotation reste possible', () => {
    expect(lireCleMaitresse('v1:' + Buffer.alloc(32, 7).toString('base64')).id).toBe('v1');
  });
});

describe('chiffrer / dechiffrer', () => {
  it('rend le clair d origine', () => {
    const r = dechiffrer(chiffrer('jeton-vercel-secret', CLE), CLE);
    expect(r).toEqual({ ouvert: true, clair: 'jeton-vercel-secret' });
  });

  it('n ecrit jamais le clair dans le scelle', () => {
    // Une erreur d implementation qui laisserait passer le clair ne se verrait
    // pas a l aller-retour : il faut le chercher dans les octets.
    const s = chiffrer('jeton-vercel-secret', CLE);
    expect(s.chiffre.toString('utf8')).not.toContain('jeton');
    expect(s.chiffre.toString('base64')).not.toContain('amV0b24');
  });

  it('ne reemploie JAMAIS le meme vecteur', () => {
    // Deux chiffres produits sous le meme couple (cle, IV) laissent retrouver
    // le clair SANS la cle. C est la faute qui casse GCM, et elle est
    // silencieuse.
    const vecteurs = new Set(
      Array.from({ length: 200 }, () => chiffrer('x', CLE).vecteur.toString('hex')),
    );
    expect(vecteurs.size).toBe(200);
  });

  it('refuse un chiffre altere au lieu de rendre des octets arbitraires', () => {
    // C est la raison d etre de GCM. Sans l etiquette, un chiffre modifie en
    // base se dechiffrerait en n importe quoi, et le collector enverrait un
    // jeton fabrique a Vercel au lieu d echouer.
    const s = chiffrer('jeton-vercel-secret', CLE);
    s.chiffre[0] = (s.chiffre[0] ?? 0) ^ 0xff;
    expect(dechiffrer(s, CLE)).toEqual({ ouvert: false, motif: 'altere' });
  });

  it('refuse une etiquette altere', () => {
    const s = chiffrer('jeton-vercel-secret', CLE);
    s.etiquette[0] = (s.etiquette[0] ?? 0) ^ 0xff;
    expect(dechiffrer(s, CLE)).toEqual({ ouvert: false, motif: 'altere' });
  });

  it('rend un echec NOMME sous une autre cle, jamais une exception nue', () => {
    // La perte de la cle maitresse est un cas prevu : chaque connexion passe
    // a « indechiffrable » et se reconnecte. L appelant doit pouvoir le
    // MARQUER, donc `dechiffrer` ne leve pas.
    const autre = lireCleMaitresse('v2:' + Buffer.alloc(32, 9).toString('base64'));
    expect(dechiffrer(chiffrer('x', CLE), autre)).toEqual({ ouvert: false, motif: 'altere' });
  });
});

describe('jetonDe', () => {
  /** Un compte réel de l'instance de test, sans rapport avec un secret. */
  const PROPRIETAIRE = proprietaire('131ab48e-055a-4a15-af4b-79ed7a2e4465');

  /** Un jeu de dépendances où rien n'est jamais appelé, que chaque test spécialise. */
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
    // Sans connexion, il n y a rien a lire ni a marquer : le confondre avec
    // « revoquee » ferait tenter un dechiffrement sur un secret qui n existe
    // pas.
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
    // Lire un secret revoque ne servirait a rien : la plateforme le refusera
    // de toute facon, pour un aller-retour reseau en plus.
    expect(lireSecret).not.toHaveBeenCalled();
  });

  it('marque indechiffrable en base quand le secret d une connexion active ne se dechiffre pas', async () => {
    // Un chiffre issu d une AUTRE cle : c est ainsi qu une rotation de
    // PROSPEO_COFFRE_CLE rend les anciens secrets illisibles.
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
    // LE COEUR DU TEST : sans ce marquage, l ecran continuerait d annoncer un
    // compte connecte qui ne l est plus.
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
    // Un succes n a rien a corriger en base : ecrire ici serait une ecriture
    // sans raison, a chaque lecture.
    expect(marquerEtat).not.toHaveBeenCalled();
  });

  it('le jeton dechiffre ne fuit jamais dans un message d erreur, meme d un appel ulterieur', async () => {
    // Un appel reussi rend le clair. Rien dans jetonDe ne doit le retenir
    // au-dela de cet appel : un echec de dependance SURVENU ENSUITE, sur un
    // autre appel, ne doit porter aucune trace de ce clair — la preuve qu il
    // n a jamais ete glisse dans un contexte d erreur partage.
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
