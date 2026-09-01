import { normalizeCompanyName } from './normalize.js';

/** En deçà, un jeton n'identifie rien : « du », « et », « 44 ». */
const MIN_TOKEN_LENGTH = 3;

/**
 * Poids du préfixe commun dans l'ajustement Winkler, valeur de référence de
 * Jaro-Winkler. Le seuil de décision du projet porte sur la confiance
 * combinée (nom + proximité + catégorie), pas sur le seul signal de nom : ce
 * n'est pas à cette constante de compenser un seuil choisi sur une autre
 * échelle.
 */
const WINKLER_SCALE = 0.1;

/** Longueur maximale du préfixe commun pris en compte, valeur usuelle. */
const WINKLER_MAX_PREFIX = 4;

/**
 * En deçà de ce ratio de longueurs, comparer deux chaînes entières lettre à
 * lettre n'a plus de sens : la fenêtre de recherche de Jaro croît avec la
 * plus longue chaîne, ce qui rend la mesure trop permissive quand une courte
 * chaîne se retrouve par hasard partiellement contenue dans une bien plus
 * longue. Exemple réel : « allard » obtient ~0.57 face à « plomberie
 * dupont », deux entreprises sans aucun rapport. En dessous du seuil, seules
 * les mesures par jeton restent sollicitées.
 */
const MIN_LENGTH_RATIO = 0.5;

export interface NameMatch {
  /** 0 à 1. */
  score: number;
  /** La variante qui a obtenu le meilleur score, `null` s'il n'y en avait aucune. */
  variant: string | null;
}

/** Similarité de Jaro, sans l'ajustement de préfixe. */
function jaro(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aMatched = new Array<boolean>(a.length).fill(false);
  const bMatched = new Array<boolean>(b.length).fill(false);

  let matches = 0;
  for (let i = 0; i < a.length; i += 1) {
    const start = Math.max(0, i - window);
    const end = Math.min(i + window + 1, b.length);
    for (let j = start; j < end; j += 1) {
      if (bMatched[j] === true) continue;
      if (a[i] !== b[j]) continue;
      aMatched[i] = true;
      bMatched[j] = true;
      matches += 1;
      break;
    }
  }
  if (matches === 0) return 0;

  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (aMatched[i] !== true) continue;
    while (bMatched[k] !== true) k += 1;
    if (a[i] !== b[k]) transpositions += 1;
    k += 1;
  }

  const half = transpositions / 2;
  return (matches / a.length + matches / b.length + (matches - half) / matches) / 3;
}

/** Jaro, majoré selon la longueur du préfixe commun. */
export function jaroWinkler(a: string, b: string): number {
  const base = jaro(a, b);
  if (base === 0) return 0;

  let prefix = 0;
  const max = Math.min(WINKLER_MAX_PREFIX, a.length, b.length);
  while (prefix < max && a[prefix] === b[prefix]) prefix += 1;

  return base + prefix * WINKLER_SCALE * (1 - base);
}

/**
 * Jetons porteurs d'identité : ni trop courts, ni génériques du métier.
 *
 * Retirer les génériques est indispensable. Sans cela « Plomberie » serait
 * intégralement contenu dans « SOS Plomberie », et deux entreprises que rien
 * ne relie s'appariéraient sur leur corps de métier.
 */
export function significantTokens(name: string, generic: readonly string[]): string[] {
  const banned = new Set(generic.map((word) => normalizeCompanyName(word)));
  // `name` est normalisé ici : c'est ce qui retire les formes juridiques
  // comme « ets » avant le découpage, en plus des accents et de la casse.
  return normalizeCompanyName(name)
    .split(' ')
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !banned.has(token));
}

/** Proportion des jetons significatifs de `a` présents dans `b`. */
export function tokenContainment(a: string, b: string, generic: readonly string[]): number {
  const tokens = significantTokens(a, generic);
  if (tokens.length === 0) return 0;
  const target = new Set(b.split(' '));
  const found = tokens.filter((token) => target.has(token)).length;
  return found / tokens.length;
}

/**
 * Toutes les façons dont un établissement peut se nommer.
 *
 * Sirene enregistre une dénomination légale qui, chez un entrepreneur
 * individuel, est un état civil — « ERIC ESCAPIN ». Google Maps connaît
 * l'enseigne — « H2O ». Sans essayer chaque variante séparément,
 * l'appariement échoue sur un cinquième de la population.
 */
export function nameVariants(denomination: string, denominationUsuelle: string | null): string[] {
  const raw: string[] = [];

  // La dénomination privée de ses parenthèses, puis chaque parenthèse.
  raw.push(denomination.replace(/\([^)]*\)/g, ' '));
  for (const found of denomination.matchAll(/\(([^)]*)\)/g)) {
    if (found[1] !== undefined) raw.push(found[1]);
  }
  if (denominationUsuelle !== null) raw.push(denominationUsuelle);

  // Chaque segment séparé par une barre oblique est un nom à part entière.
  const split = raw.flatMap((value) => value.split('/'));

  const seen = new Set<string>();
  for (const value of split) {
    const normalized = normalizeCompanyName(value);
    if (normalized !== '') seen.add(normalized);
  }
  return [...seen];
}

/** Retire les espaces : « rgservices » et « rg services » désignent la même enseigne. */
function despace(value: string): string {
  return value.replace(/ /g, '');
}

/** Proportion, entre 0 et 1, de la plus courte longueur sur la plus longue. */
function lengthRatio(a: string, b: string): number {
  if (a.length === 0 || b.length === 0) return 0;
  return Math.min(a.length, b.length) / Math.max(a.length, b.length);
}

/**
 * Jaro-Winkler entre deux chaînes entières, neutralisé quand leurs longueurs
 * sont trop disparates (voir `MIN_LENGTH_RATIO`) pour éviter le faux positif
 * d'une courte chaîne noyée par hasard dans une bien plus longue.
 */
function wholeStringScore(a: string, b: string): number {
  if (lengthRatio(a, b) < MIN_LENGTH_RATIO) return 0;
  return jaroWinkler(a, b);
}

/**
 * Meilleure similarité Jaro-Winkler entre jetons significatifs pris un à un.
 *
 * Complète `tokenContainment`, qui exige une égalité stricte entre jetons :
 * ici « h20 » peut se rapprocher de « h2o » même sans être identique,
 * indépendamment des autres mots — génériques ou non — du nom candidat.
 */
function bestTokenScore(a: string, b: string, generic: readonly string[]): number {
  const aTokens = significantTokens(a, generic);
  const bTokens = significantTokens(b, generic);
  let best = 0;
  for (const aToken of aTokens) {
    for (const bToken of bTokens) {
      best = Math.max(best, jaroWinkler(aToken, bToken));
    }
  }
  return best;
}

/**
 * Meilleure correspondance entre les variantes d'un prospect et un nom Maps.
 *
 * Cinq mesures sont confrontées et la plus favorable l'emporte. Jaro-Winkler
 * couvre les fautes et abréviations, sa variante sans espaces couvre les
 * enseignes agglutinées, l'inclusion de jetons — dans les deux sens — couvre
 * les noms qui se contiennent sans se ressembler, et la similarité par jeton
 * rattrape une enseigne courte noyée dans un nom candidat plus long, comme
 * « H20 » face à « H2O Plomberie ».
 */
export function bestNameMatch(
  variants: readonly string[],
  candidateName: string,
  generic: readonly string[],
): NameMatch {
  const target = normalizeCompanyName(candidateName);
  let best: NameMatch = { score: 0, variant: null };

  for (const variant of variants) {
    const score = Math.max(
      wholeStringScore(variant, target),
      wholeStringScore(despace(variant), despace(target)),
      tokenContainment(variant, target, generic),
      tokenContainment(target, variant, generic),
      bestTokenScore(variant, target, generic),
    );
    if (score > best.score) best = { score, variant };
  }
  return best;
}
