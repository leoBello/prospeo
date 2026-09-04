import type { Enums } from '@prospeo/db';
import { dechiffrer, type CleMaitresse, type Scelle, type Ouverture } from '@prospeo/coffre';
import type { Proprietaire } from './proprietaire.js';
import type { ResultatJetonInstallation } from './sources/github-app.js';

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

/**
 * Ce que `jetonInstallationGithub` emploie — distinct de `CoffreDeps` :
 * GitHub n'a ni secret à déchiffrer ni clé maîtresse, voir le commentaire
 * d'en-tête de la tâche qui l'introduit.
 */
export interface CoffreGithubDeps {
  lireInstallation(
    proprietaire: Proprietaire,
  ): Promise<{ connexionId: string; etat: EtatConnexion; installationId: string | null } | null>;
  marquerEtat(connexionId: string, etat: EtatConnexion): Promise<void>;
  creerJetonInstallation(installationId: string): Promise<ResultatJetonInstallation>;
}

/**
 * Lit le jeton d'installation d'une connexion GitHub, ou dit pourquoi elle
 * n'en rend pas. Même forme que `jetonDe`, pour un mécanisme différent : rien
 * n'est déchiffré, un jeton neuf est fabriqué à chaque appel (il expire de
 * lui-même en une heure — rien à faire péricliter).
 *
 * **`revoquee` en base ne tente même pas de fabriquer un jeton** — GitHub
 * refuserait de toute façon, pour un aller-retour réseau en plus.
 *
 * **GitHub refusant l'installation (401/404) MARQUE la connexion avant de
 * rendre** — même discipline que `jetonDe` sur un secret indéchiffrable : ne
 * pas le faire laisserait l'écran annoncer un compte connecté qui ne l'est
 * plus. Un échec transitoire (réseau, 5xx) NE marque rien : il lève, pour que
 * l'appelant le voie comme l'échec ponctuel qu'il est.
 */
export async function jetonInstallationGithub(
  deps: CoffreGithubDeps,
  proprietaire: Proprietaire,
): Promise<{ jeton: string } | { jeton: null; etat: EtatConnexion | 'absente' }> {
  const connexion = await deps.lireInstallation(proprietaire);
  if (connexion === null) {
    return { jeton: null, etat: 'absente' };
  }
  if (connexion.etat !== 'active') {
    return { jeton: null, etat: connexion.etat };
  }
  if (connexion.installationId === null) {
    throw new Error("connexion GitHub active sans identifiant d'installation — état incohérent");
  }

  const resultat = await deps.creerJetonInstallation(connexion.installationId);
  if (!resultat.ok) {
    if (resultat.motif === 'revoquee') {
      await deps.marquerEtat(connexion.connexionId, 'revoquee');
      return { jeton: null, etat: 'revoquee' };
    }
    throw new Error(resultat.message);
  }
  return { jeton: resultat.token };
}
