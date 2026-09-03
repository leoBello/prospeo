import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Le seul endroit du dépôt qui manipule un jeton en clair.
 *
 * **La clé vit dans l'environnement de qui l'emploie — collector ou relais —
 * jamais dans la base.** Le coffre Supabase aurait mis la clé chez le même
 * fournisseur que les données ; ainsi, une copie complète de la base ne
 * vaut rien.
 *
 * Extrait du collector au chantier n°8, étape 3 : le relais OAuth
 * (`apps/relais-oauth`) doit chiffrer avec le MÊME algorithme et la MÊME
 * clé que le collector déchiffre — les dépendre l'un de l'autre aurait
 * couplé un service à un CLI ; ce paquet partagé évite les deux.
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
 * La perte de la clé maîtresse est un cas prévu : chaque connexion passe à
 * « indéchiffrable » et se reconnecte. L'appelant doit pouvoir le MARQUER en
 * base, ce qu'une exception nue lui interdirait sans un `try` à chaque appel.
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
