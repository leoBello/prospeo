import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Sous ce jsdom (sans URL http(s) configurée), `window.localStorage` vaut
 * `undefined` — constaté par une sonde directe, pas supposé : l'avertissement
 * Node « localStorage is not available because --localstorage-file was not
 * provided » le confirme. `preferences.tsx` s'en accommode pour ses trois
 * préférences (thème, locale, repli du brief) : son écriture échoue en
 * silence, et un test qui se contente de lire les valeurs par défaut ne voit
 * jamais le trou.
 *
 * Mais un test qui veut prouver une **vraie** persistance — démonter un
 * composant, le remonter, vérifier que la préférence a survécu — a besoin
 * d'un magasin qui survit réellement, pas d'un `undefined` qui avale
 * silencieusement chaque écriture. `BriefDuJour.test.tsx` portait ce
 * palliatif en local (tâche 8) ; il est remonté ici, partagé, après qu'un
 * second fichier (`BarreHaut.test.tsx`) s'est mis à contourner le même trou
 * sans le combler — la preuve qu'un palliatif local se réinvente ou
 * s'omet à la tâche suivante plutôt que de se retrouver.
 *
 * Le magasin est remis à zéro après CHAQUE test (`afterEach`), pas une
 * seule fois pour toute la suite : sans ça, l'ordre dans lequel Vitest
 * choisit d'exécuter les fichiers déciderait quels tests héritent des
 * écritures de leurs voisins — un couplage invisible en lecture de test.
 *
 * À retirer si ce dépôt adopte un jour un jsdom configuré avec une URL
 * http(s) (ce qui active son propre `localStorage`), ou une dépendance
 * dédiée (`jest-environment-jsdom` en porte un ; ce dépôt ne l'installe
 * pas).
 */
class MagasinMemoire {
  private valeurs = new Map<string, string>();
  clear(): void {
    this.valeurs.clear();
  }
  getItem(cle: string): string | null {
    return this.valeurs.has(cle) ? this.valeurs.get(cle)! : null;
  }
  setItem(cle: string, valeur: string): void {
    this.valeurs.set(cle, valeur);
  }
}

// Ce fichier sert aussi les tests qui déclarent l'environnement `node` (voir
// `i18n/i18n.test.ts`, `ui/theme.test.ts`, `ui/guidelines.test.ts`) : là où
// il n'y a pas de `window`, il n'y a pas de `localStorage` à poser.
if (typeof window !== 'undefined') {
  const magasin = new MagasinMemoire();
  Object.defineProperty(window, 'localStorage', {
    value: magasin,
    writable: true,
    configurable: true,
  });
  afterEach(() => magasin.clear());
}

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
