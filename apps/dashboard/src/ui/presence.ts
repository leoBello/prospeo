import type { WebPresenceCategory } from '@prospeo/core';
import type { TranslationKey } from '../i18n/translate.js';
import type { BadgeTon } from './kit/Badge.js';

/**
 * Comment se rend une catégorie de présence web, partout où elle se rend.
 *
 * **Pourquoi ce fichier existe.** Ces deux tables vivaient dans
 * `panel/FicheTab.tsx`, seul consommateur à l'époque. L'écran de campagne en
 * a besoin des mêmes : la présence web y porte l'argument de vente, et un
 * second jeu de correspondances écrit à côté aurait dérivé au premier
 * ajustement — un ton corrigé d'un côté, pas de l'autre, et deux écrans qui
 * ne disent plus la même chose du même fait.
 */

/**
 * Le ton de chaque catégorie.
 *
 * Tiré de `PRESENCE_POINTS` (`@prospeo/core`), pas inventé ici : un site mort
 * ou une simple page sociale rapporte plus de points qu'un site vivant, parce
 * que c'est une meilleure cible de prospection — `has_site` vaut -100 et
 * disqualifie presque le prospect. Le ton suit donc la valeur de vente, pas
 * un jugement de qualité du site.
 */
export const TON_PRESENCE: Record<WebPresenceCategory, BadgeTon> = {
  social_only: 'succes',
  dead_site: 'succes',
  none: 'accent',
  directory_only: 'info',
  has_site: 'danger',
};

/**
 * `Record` plutôt qu'une concaténation `'presence.' + category` : une
 * catégorie ajoutée à `WebPresenceCategory` sans son entrée ici fait échouer
 * la compilation au lieu de rendre une clé i18n absente en silence.
 */
export const CLE_PRESENCE: Record<WebPresenceCategory, TranslationKey> = {
  none: 'presence.none',
  social_only: 'presence.social_only',
  directory_only: 'presence.directory_only',
  dead_site: 'presence.dead_site',
  has_site: 'presence.has_site',
};
