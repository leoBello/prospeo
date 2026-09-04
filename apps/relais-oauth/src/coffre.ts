import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Copie de `packages/coffre/src/coffre.ts`, DÉLIBÉRÉE — pas un oubli du
 * refactor de l'étape 3.
 *
 * Vercel interdit à un projet dont le « Root Directory » est
 * `apps/relais-oauth` d'accéder à des fichiers en dehors de ce dossier
 * (documenté : « Your app will not be able to access files outside of that
 * directory. You also cannot use `..` to move up a level »). Le dashboard
 * n'a jamais heurté cette limite : il n'importe `@prospeo/db` que pour des
 * TYPES, effacés à la compilation. Ce module-ci, lui, est appelé pour de
 * vrai à l'exécution (`chiffrer`, `lireCleMaitresse`) — la première fois que
 * ce dépôt a une fonction Vercel qui exécute du code d'un paquet partagé.
 *
 * Le collector, qui tourne en local et non sur Vercel, continue d'importer
 * `@prospeo/coffre` sans changement — cette limite ne le concerne pas.
 *
 * **Toute modification de `chiffrer`/`dechiffrer`/`lireCleMaitresse` doit
 * être répercutée dans LES DEUX fichiers.** Testé une fois dans
 * `packages/coffre/src/coffre.test.ts` : l'algorithme est identique, seul
 * l'endroit où il vit diffère.
 */

/** AES-256 : trente-deux octets, ni plus ni moins. */
const TAILLE_CLE = 32;

/** Douze octets, la taille recommandée pour GCM — au-delà, la spécification
 *  impose un traitement supplémentaire sans rien gagner. */
const TAILLE_VECTEUR = 12;

export interface CleMaitresse {
  /** Quelle clé, pour qu'une rotation reste possible sans tout re-chiffrer. */
  id: string;
  octets: Buffer;
}

export interface Scelle {
  chiffre: Buffer;
  vecteur: Buffer;
  etiquette: Buffer;
  cleId: string;
}

/**
 * `ouvert: false` avec un motif, plutôt qu'une exception.
 *
 * **Un seul motif, `'altere'`** : `dechiffrer` reçoit toujours une
 * `CleMaitresse` déjà validée par `lireCleMaitresse`, qui lève avant d'en
 * rendre une — une clé absente ne peut donc structurellement pas atteindre
 * cette fonction.
 */
export type Ouverture =
  | { ouvert: true; clair: string }
  | { ouvert: false; motif: 'altere' };

/**
 * Lit la clé maîtresse, ou **empêche le processus appelant de démarrer**.
 *
 * Format `<id>:<32 octets en base64>`. L'identifiant voyage avec la clé pour
 * qu'on ne puisse pas les désynchroniser en les rangeant séparément.
 */
export function lireCleMaitresse(brut: string | undefined): CleMaitresse {
  if (brut === undefined || brut === '') {
    throw new Error(
      'PROSPEO_COFFRE_CLE est obligatoire : sans elle, aucun jeton ne peut être lu ni écrit.',
    );
  }
  const separateur = brut.indexOf(':');
  if (separateur <= 0) {
    throw new Error('PROSPEO_COFFRE_CLE attend la forme « <id>:<clé en base64> ».');
  }
  const id = brut.slice(0, separateur);
  const octets = Buffer.from(brut.slice(separateur + 1), 'base64');
  if (octets.length !== TAILLE_CLE) {
    throw new Error(
      `PROSPEO_COFFRE_CLE doit porter ${TAILLE_CLE} octets, ${octets.length} reçus.`,
    );
  }
  return { id, octets };
}

export function chiffrer(clair: string, cle: CleMaitresse): Scelle {
  const vecteur = randomBytes(TAILLE_VECTEUR);
  const chiffreur = createCipheriv('aes-256-gcm', cle.octets, vecteur);
  const chiffre = Buffer.concat([chiffreur.update(clair, 'utf8'), chiffreur.final()]);
  return { chiffre, vecteur, etiquette: chiffreur.getAuthTag(), cleId: cle.id };
}

export function dechiffrer(scelle: Scelle, cle: CleMaitresse): Ouverture {
  try {
    const dechiffreur = createDecipheriv('aes-256-gcm', cle.octets, scelle.vecteur);
    dechiffreur.setAuthTag(scelle.etiquette);
    const clair = Buffer.concat([dechiffreur.update(scelle.chiffre), dechiffreur.final()]);
    return { ouvert: true, clair: clair.toString('utf8') };
  } catch {
    return { ouvert: false, motif: 'altere' };
  }
}
