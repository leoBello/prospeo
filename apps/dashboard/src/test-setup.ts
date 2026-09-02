import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Sans ce démontage, deux tests qui rendent le même composant laissent deux
 * copies dans le document : les requêtes `getByText` deviennent ambiguës et
 * échouent sur un « found multiple elements » qui n'a rien à voir avec la
 * règle testée.
 */
afterEach(cleanup);

/*
 * jsdom n'a pas de « top layer » : rien n'y est jamais modal ni en plein
 * écran. Floating UI le demande quand même — `isTopLayer()` interroge `:modal`
 * sur chaque ancêtre, à chaque passe de calcul de position d'un élément
 * flottant (l'infobulle, demain le menu ou la liste déroulante).
 *
 * nwsapi, le moteur de sélecteurs de jsdom, répond à `:modal` et à
 * `:fullscreen` en rappelant `element.matches()` pour déléguer à une
 * implémentation native. Dans jsdom il n'y en a pas : c'est lui-même qu'il
 * rappelle, jusqu'au débordement de pile, qu'il rattrape en silence pour
 * renvoyer `false`. Un seul `matches(':modal')` coûte donc 1,7 million
 * d'appels imbriqués et une demi-seconde ; l'ouverture d'une infobulle en
 * déclenche assez pour faire passer son fichier de test de deux à cent
 * secondes, et pour affamer la boucle d'événements au point que les délais de
 * Vitest eux-mêmes se déclenchent avec une minute de retard.
 *
 * On répond donc nous-mêmes, et `false` est la réponse exacte pour jsdom.
 * À retirer le jour où nwsapi cessera de se rappeler lui-même (le défaut est
 * présent jusqu'à la 2.2.27 incluse, la dernière publiée à ce jour).
 */
const PSEUDO_CLASSES_SANS_EQUIVALENT_JSDOM = new Set([':modal', ':fullscreen']);

// Ce fichier sert aussi les tests qui déclarent l'environnement `node` (voir
// `theme.test.ts`) : là où il n'y a pas de DOM, il n'y a rien à corriger.
if (typeof Element !== 'undefined') {
  const matchesNatif = Element.prototype.matches;
  Element.prototype.matches = function (this: Element, selecteurs: string): boolean {
    if (PSEUDO_CLASSES_SANS_EQUIVALENT_JSDOM.has(selecteurs)) {
      return false;
    }
    return matchesNatif.call(this, selecteurs);
  };
}
