import type { Enums } from '@prospeo/db';
import { dechiffrer, type CleMaitresse, type Scelle, type Ouverture } from '@prospeo/coffre';
import type { Proprietaire } from './proprietaire.js';

/**
 * Ce que le collector garde du coffre : LIRE un jeton, jamais le chiffrer.
 *
 * `chiffrer`/`dechiffrer`/`lireCleMaitresse` ont rejoint `@prospeo/coffre`
 * au chantier n°8, étape 3 — partagés avec `apps/relais-oauth`, qui écrit
 * les connexions que cette fonction lit. `jetonDe` reste ICI : lui seul lit
 * `connexion_secret`, et c'est le seul consommateur à l'avoir jamais fait.
 */

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
  const ouverture: Ouverture =
    scelle === null ? { ouvert: false, motif: 'altere' } : dechiffrer(scelle, deps.cle);

  if (!ouverture.ouvert) {
    await deps.marquerEtat(connexion.id, 'indechiffrable');
    return { jeton: null, etat: 'indechiffrable' };
  }

  return { jeton: ouverture.clair };
}
