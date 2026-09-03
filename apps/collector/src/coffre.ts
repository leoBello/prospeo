import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { Enums } from '@prospeo/db';
import type { Proprietaire } from './proprietaire.js';

/**
 * Le seul endroit du dépôt qui manipule un jeton en clair.
 *
 * **La clé vit dans l'environnement du collector, jamais dans la base.** Le
 * coffre Supabase aurait mis la clé chez le même fournisseur que les données ;
 * ainsi, une copie complète de la base ne vaut rien.
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
 * cette fonction. (Revue de branche du 3 septembre 2026 : le plan portait
 * encore `'cle_absente' | 'altere'` dans sa ligne « Interfaces », restée en
 * décalage avec le code qu'il donnait lui-même plus bas.)
 */
export type Ouverture =
  | { ouvert: true; clair: string }
  | { ouvert: false; motif: 'altere' };

/**
 * Lit la clé maîtresse, ou **empêche le collector de démarrer**.
 *
 * Format `<id>:<32 octets en base64>`. L'identifiant voyage avec la clé pour
 * qu'on ne puisse pas les désynchroniser en les rangeant séparément.
 *
 * Refuser ici plutôt qu'au premier chiffrement : un collector démarré sans
 * coffre échouerait au premier job, **après** avoir créé un dépôt GitHub — et
 * un dépôt créé ne se « dé-crée » pas.
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
  // Un vecteur NEUF à chaque écriture. Le réemployer sous la même clé laisse
  // retrouver le clair sans la clé — la faute qui casse GCM, et elle est
  // silencieuse.
  const vecteur = randomBytes(TAILLE_VECTEUR);
  const chiffreur = createCipheriv('aes-256-gcm', cle.octets, vecteur);
  const chiffre = Buffer.concat([chiffreur.update(clair, 'utf8'), chiffreur.final()]);
  return { chiffre, vecteur, etiquette: chiffreur.getAuthTag(), cleId: cle.id };
}

export function dechiffrer(scelle: Scelle, cle: CleMaitresse): Ouverture {
  try {
    const dechiffreur = createDecipheriv('aes-256-gcm', cle.octets, scelle.vecteur);
    // `setAuthTag` avant `final` : c'est `final` qui vérifie l'étiquette et
    // lève si le chiffré a bougé.
    dechiffreur.setAuthTag(scelle.etiquette);
    const clair = Buffer.concat([dechiffreur.update(scelle.chiffre), dechiffreur.final()]);
    return { ouvert: true, clair: clair.toString('utf8') };
  } catch {
    // Chiffré modifié, étiquette fausse, ou mauvaise clé : les trois mènent au
    // même geste — reconnecter le compte. La nuance vit dans
    // `connexion_plateforme.etat`, pas ici.
    return { ouvert: false, motif: 'altere' };
  }
}

/** Alias sur les types générés par la migration du chantier n°8, étape 2. */
export type PlateformeConnectee = Enums<'plateforme_connectee'>;
export type EtatConnexion = Enums<'etat_connexion'>;

/**
 * Uniquement ce que `jetonDe` emploie.
 *
 * Des fonctions, jamais un client Supabase brut — comme `FileDeps`
 * (`stages/file.ts`) et `ChaineDeps` (`chaine.ts`) — pour que `jetonDe` se
 * teste sans base ni réseau. `cli.ts` est le seul endroit qui assemblera un
 * `CoffreDeps` réel, à partir d'un client `service_role`.
 */
export interface CoffreDeps {
  lireConnexion(
    proprietaire: Proprietaire,
    plateforme: PlateformeConnectee,
  ): Promise<{ id: string; etat: EtatConnexion } | null>;
  lireSecret(connexionId: string): Promise<Scelle | null>;
  marquerEtat(connexionId: string, etat: EtatConnexion): Promise<void>;
  cle: CleMaitresse;
}

/**
 * Lit le jeton en clair d'une connexion, ou dit pourquoi elle n'en rend pas.
 *
 * **`revoquee` n'essaie même pas de déchiffrer** : la plateforme refuserait
 * de toute façon le jeton, pour un aller-retour réseau en plus, et pour un
 * secret qu'il est inutile de manipuler.
 *
 * **Un secret qui ne se déchiffre pas MARQUE la connexion avant de rendre.**
 * Sans ce marquage, l'écran continuerait d'annoncer un compte connecté qui ne
 * l'est plus — l'affordance que la doctrine interdit. Le marquer *avant* de
 * rendre évite qu'un appelant lise un état pas encore vrai en base.
 *
 * **Un déchiffrement réussi n'écrit rien** : `connexion_plateforme.etat` est
 * déjà `active`, l'écrire de nouveau serait une écriture sans raison à
 * chaque lecture.
 */
export async function jetonDe(
  deps: CoffreDeps,
  proprietaire: Proprietaire,
  plateforme: PlateformeConnectee,
): Promise<{ jeton: string } | { jeton: null; etat: EtatConnexion | 'absente' }> {
  const connexion = await deps.lireConnexion(proprietaire, plateforme);
  if (connexion === null) {
    return { jeton: null, etat: 'absente' };
  }
  if (connexion.etat !== 'active') {
    return { jeton: null, etat: connexion.etat };
  }

  const scelle = await deps.lireSecret(connexion.id);
  // Pas de secret en base pour une connexion active : une incohérence de
  // même nature qu'un chiffré altéré — le même geste la répare : reconnecter.
  const ouverture: Ouverture =
    scelle === null ? { ouvert: false, motif: 'altere' } : dechiffrer(scelle, deps.cle);

  if (!ouverture.ouvert) {
    await deps.marquerEtat(connexion.id, 'indechiffrable');
    return { jeton: null, etat: 'indechiffrable' };
  }

  return { jeton: ouverture.clair };
}
