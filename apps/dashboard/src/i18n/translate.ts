import { fr } from './fr.js';
import { en } from './en.js';

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Le jeu de clés est celui du catalogue français, locale de référence. */
export type TranslationKey = keyof typeof fr;

export type TranslationParams = Record<string, string | number>;

const CATALOGUES: Record<Locale, Record<string, string>> = { fr, en };

/**
 * Choix de la forme singulière.
 *
 * Ce n'est pas la même règle d'une langue à l'autre : le français met au
 * singulier tout ce qui est strictement inférieur à deux — « 0 prospect »,
 * « 1 prospect » — là où l'anglais ne le fait que pour un, et écrit
 * « 0 prospects ». Un unique test `count === 1` produirait donc « 0
 * prospects » en français, faute discrète mais permanente puisque les
 * compteurs de pipeline resteront à zéro plusieurs semaines.
 */
function estSingulier(locale: Locale, count: number): boolean {
  return locale === 'fr' ? Math.abs(count) < 2 : Math.abs(count) === 1;
}

/**
 * Remplace les jetons `{nom}` par les paramètres fournis.
 *
 * Un paramètre absent laisse le jeton en place. Substituer une chaîne vide
 * donnerait « relance en retard de  j » : une phrase qui a l'air d'un défaut
 * de mise en forme et que personne ne rapporte. Le jeton intact, lui, désigne
 * sa propre cause.
 */
function interpoler(template: string, params: TranslationParams): string {
  return template.replace(/\{(\w+)\}/g, (jeton, nom: string) => {
    const valeur = params[nom];
    return valeur === undefined ? jeton : String(valeur);
  });
}

export function translate(
  locale: Locale,
  key: TranslationKey,
  params: TranslationParams = {},
): string {
  const catalogue = CATALOGUES[locale];
  const count = params['count'];

  let cle: string = key;
  if (typeof count === 'number' && estSingulier(locale, count)) {
    const singulier = `${key}_one`;
    if (catalogue[singulier] !== undefined) cle = singulier;
  }

  // Le repli sur le français précède le repli sur la clé nue : une phrase
  // dans la mauvaise langue reste lisible, un identifiant technique affiché
  // à l'écran ne l'est pas.
  const template = catalogue[cle] ?? fr[cle as TranslationKey] ?? cle;
  return interpoler(template, params);
}
