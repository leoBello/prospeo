import { describe, expect, it } from 'vitest';
import { chiffrer, dechiffrer, lireCleMaitresse } from './coffre.js';

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
    s.chiffre[0] = s.chiffre[0] ^ 0xff;
    expect(dechiffrer(s, CLE)).toEqual({ ouvert: false, motif: 'altere' });
  });

  it('refuse une etiquette altere', () => {
    const s = chiffrer('jeton-vercel-secret', CLE);
    s.etiquette[0] = s.etiquette[0] ^ 0xff;
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
