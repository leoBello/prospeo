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

/**
 * Proportion des jetons significatifs de `a` présents dans `b`.
 *
 * `b` est normalisé de la même façon que `a` avant le découpage : sans cela,
 * la comparaison serait asymétrique et un jeton de `a` en minuscules ne
 * retrouverait jamais son équivalent en majuscules dans `b`. `bestNameMatch`
 * normalise déjà ses deux arguments avant d'appeler cette fonction, donc le
 * piège ne s'y voit pas — mais `tokenContainment` est exportée et peut être
 * appelée directement avec des chaînes brutes.
 */
/**
 * Plafond appliqué quand le nom source ne tient qu'à un seul jeton
 * significatif.
 *
 * Un patronyme n'est pas une identité. Quand tout ce qui distingue une
 * entreprise se réduit à un nom de famille — « Martin », une fois le métier
 * retiré — la coïncidence avec un candidat qui porte ce même patronyme est
 * trop banale pour emporter seule la décision : « Martin » est aussi courant
 * qu'homonyme, et le cas doit revenir à un humain plutôt que fusionner
 * automatiquement. 0,80 est une valeur de calibrage, choisie pour rester sous
 * le seuil de fusion automatique ; elle est destinée à être revue sur données
 * réelles.
 */
const SINGLE_TOKEN_CAP = 0.8;

/**
 * Proportion des mots non génériques de `a` retrouvés dans `b`, **jetons
 * courts compris**.
 *
 * Elle ne remplace pas `tokenContainment` : elle la borne. La différence est
 * le sort des jetons de moins de trois lettres. `significantTokens` les
 * écarte — « du », « et », « 44 » n'identifient rien — mais ils portent
 * parfois toute la distinction : « AB SERVICES » face à « CD SERVICES » se
 * réduisait des deux côtés au seul « services », donnant une couverture
 * parfaite et, avec une catégorie concordante, une fusion automatique entre
 * deux entreprises différentes.
 *
 * Compter ces jetons au dénominateur sans exiger qu'ils identifient quoi que
 * ce soit règle le cas : ils ne peuvent plus être ignorés, seulement
 * retrouvés ou manquants. La mesure peut être un peu sévère — « MARTIN DU
 * BOIS » face à « Martin Bois » rend 2/3 — mais elle se trompe du bon côté :
 * un appariement manqué coûte une minute de revue, un faux appariement coûte
 * l'appel.
 */
export function tokenCoverage(a: string, b: string, generic: readonly string[]): number {
  const banned = new Set(generic.map((word) => normalizeCompanyName(word)));
  const tokens = normalizeCompanyName(a)
    .split(' ')
    .filter((token) => token !== '' && !banned.has(token));
  if (tokens.length === 0) return 0;
  const target = new Set(normalizeCompanyName(b).split(' '));
  return tokens.filter((token) => target.has(token)).length / tokens.length;
}

export function tokenContainment(a: string, b: string, generic: readonly string[]): number {
  const tokens = significantTokens(a, generic);
  if (tokens.length === 0) return 0;
  const target = new Set(normalizeCompanyName(b).split(' '));
  const found = tokens.filter((token) => target.has(token)).length;
  const ratio = found / tokens.length;
  return tokens.length === 1 ? Math.min(ratio, SINGLE_TOKEN_CAP) : ratio;
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

/**
 * Le nom privé de ses seuls mots de métier, jetons courts conservés.
 *
 * Distinct de `significantTokens`, et la différence compte deux fois :
 *
 * - elle garde les jetons de moins de trois lettres, sans quoi le « rg » de
 *   « Plombier Nantes RG Services » disparaîtrait — or c'est précisément lui
 *   qu'il faut recoller à « services » pour retrouver l'enseigne
 *   « RGSERVICES » ;
 * - elle rend une chaîne, pas des jetons, parce que les mesures de chaîne
 *   entière en ont besoin.
 *
 * Sans ce retrait, ces mesures voyaient le métier des deux côtés et le
 * comptaient comme une ressemblance : « lallemand plomberie » face à
 * « adorenov plomberie » valait 0,755, quand les deux noms seuls valent
 * 0,569. Deux entreprises que rien ne relie se ressemblaient par leur seul
 * corps de métier — celui-là même sur lequel toute la population est
 * sélectionnée, et qui ne distingue donc jamais personne.
 */
export function stripGenericTokens(name: string, generic: readonly string[]): string {
  const banned = new Set(generic.map((word) => normalizeCompanyName(word)));
  return normalizeCompanyName(name)
    .split(' ')
    .filter((token) => token !== '' && !banned.has(token))
    .join(' ');
}

/**
 * Longueur minimale d'une enseigne agglutinée pour que son inclusion compte.
 *
 * En deçà, l'inclusion d'une suite de lettres dans une autre est une
 * coïncidence banale plutôt qu'un indice.
 */
const MIN_CONTAINMENT_LENGTH = 5;

/**
 * L'un des deux noms est-il l'autre, écrit sans ses espaces ?
 *
 * C'est le cas « RGSERVICES » / « RG Services » : Sirene agglutine ce que
 * Maps sépare. La comparaison de chaînes entières sans espaces devait le
 * couvrir, mais son garde-fou de ratio de longueur l'annule dès que la fiche
 * Maps porte des mots en plus — « Plombier Nantes RG Services » donne 0,417,
 * sous le seuil de 0,50 — et c'est la forme NORMALE d'une fiche d'artisan.
 *
 * L'inclusion doit commencer et finir sur une **frontière de jeton**, sans
 * quoi elle rouvrirait la porte que la contrainte de longueur ferme :
 * « martin » est bien contenu dans « martinez », mais s'y termine au milieu
 * d'un mot — c'est une extension, donc un autre patronyme. « rgservices »,
 * lui, couvre « rg » et « services » entiers.
 */
function agglutinatedContainment(a: string, b: string): number {
  return containsOnBoundaries(a, b) || containsOnBoundaries(b, a) ? 1 : 0;
}

/** `needle`, sans ses espaces, couvre-t-il des jetons entiers de `haystack` ? */
function containsOnBoundaries(needle: string, haystack: string): boolean {
  const text = despace(needle);
  if (text.length < MIN_CONTAINMENT_LENGTH) return false;

  const tokens = haystack.split(' ').filter((token) => token !== '');
  const starts = new Set<number>();
  const ends = new Set<number>();
  let offset = 0;
  for (const token of tokens) {
    starts.add(offset);
    offset += token.length;
    ends.add(offset);
  }

  const flat = tokens.join('');
  for (let at = flat.indexOf(text); at !== -1; at = flat.indexOf(text, at + 1)) {
    if (starts.has(at) && ends.has(at + text.length)) return true;
  }
  return false;
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
 * Écart de longueur, en caractères, au-delà duquel deux jetons ne sont plus
 * comparés lettre à lettre (voir `bestTokenScore`).
 */
const MAX_TOKEN_LENGTH_DIFF = 1;

/**
 * Meilleure similarité Jaro-Winkler entre jetons significatifs pris un à un.
 *
 * Complète `tokenContainment`, qui exige une égalité stricte entre jetons :
 * ici « h20 » peut se rapprocher de « h2o » même sans être identique,
 * indépendamment des autres mots — génériques ou non — du nom candidat.
 *
 * La comparaison n'est admise que si les deux jetons ont des longueurs qui ne
 * s'écartent pas de plus d'un caractère (`MAX_TOKEN_LENGTH_DIFF`). Une mesure
 * jeton à jeton sert à rattraper les variantes d'écriture d'un même nom, pas
 * les noms qui se prolongent. Jaro-Winkler récompense généreusement une
 * extension de préfixe : « martin » face à « martinez » atteint 0.95, un
 * score de nom plus haut que « h20 » face à « h2o » — alors que ce sont deux
 * situations sans rapport. « h2o »/« h20 » est une substitution à longueur
 * égale, une variante de transcription du même nom. « martin »/« martinez »
 * est une extension, c'est-à-dire un autre patronyme, comme allard/allardin
 * ou dupont/dupontel. Deux jetons dont les longueurs s'écartent de deux
 * caractères ou plus sont des noms différents : s'il s'agissait vraiment de
 * la même entreprise, la comparaison de chaînes entières ou l'inclusion de
 * jetons l'auraient déjà rattrapée.
 *
 * Une égalité stricte entre l'unique jeton significatif de la source et un
 * jeton du candidat n'est pas une variante d'écriture : c'est exactement ce
 * que `tokenContainment` mesure déjà, plafond compris (voir
 * `SINGLE_TOKEN_CAP`). La laisser remonter ici — Jaro-Winkler d'un jeton avec
 * lui-même vaut toujours 1 — annulerait silencieusement ce plafond par la
 * porte à côté : « martin » de « SARL MARTIN SERRURERIE » retrouverait son
 * 1,00 face à « Martin Dépannage » dès que « serrurerie » et « dépannage »
 * ont tous deux été retirés comme génériques du métier. Cette exclusion ne
 * change rien pour les jetons qui se ressemblent sans être identiques,
 * comme « h20 »/« h2o » : c'est précisément le cas que cette fonction sert à
 * couvrir.
 */
/**
 * Longueur en deçà de laquelle deux jetons ne se comparent plus lettre à
 * lettre, sauf à être composés exactement des mêmes caractères.
 *
 * Sur un jeton court, Jaro-Winkler mesure le préfixe partagé et non
 * l'identité. Mesuré sur le lot de calibration : « epb » face à « epsi »
 * vaut 0,778 et face à « epa » 0,822, quand « epb » face à « ebp » — le
 * MÊME sigle, deux lettres transposées — ne vaut que 0,600. Un score qui
 * classe deux inconnus au-dessus du bon candidat ne mesure rien d'utile, et
 * c'est lui qui faisait retenir « C'est le Plombier » pour « EPB ».
 *
 * L'exception des mêmes caractères garde le cas que la mesure par jeton sert
 * à couvrir : « h20 » et « h2o » sont deux transcriptions d'un même nom, pas
 * deux noms qui commencent pareil.
 */
const MIN_FUZZY_TOKEN_LENGTH = 5;

/**
 * Chiffres employés pour les lettres qu'ils imitent.
 *
 * « H20 » pour « H2O » est le cas de la base, et ce n'est pas une faute de
 * frappe : c'est la façon dont l'enseigne est déposée chez Sirene. Sans ce
 * repli, « h20 » et « h2o » sont deux jetons courts sans caractère commun en
 * dernière position, donc rejetés comme « epb » et « epa » — alors que l'un
 * est le même nom et l'autre non. On s'en tient aux trois substitutions
 * réellement usuelles : élargir la table reviendrait à rapprocher des noms
 * que rien ne rapproche.
 */
const LOOKALIKE_DIGITS: Record<string, string> = { '0': 'o', '1': 'i', '5': 's' };

function foldLookalikes(value: string): string {
  return [...value].map((char) => LOOKALIKE_DIGITS[char] ?? char).join('');
}

/** Deux jetons qui ne diffèrent que par l'ordre, ou par un chiffre sosie. */
function sameLetters(a: string, b: string): boolean {
  const fold = (value: string): string => [...foldLookalikes(value)].sort().join('');
  return fold(a) === fold(b);
}

function bestTokenScore(a: string, b: string, generic: readonly string[]): number {
  const aTokens = significantTokens(a, generic);
  const bTokens = significantTokens(b, generic);

  // La mesure ne vaut que pour une enseigne d'UN SEUL mot — ce que sa
  // documentation dit depuis toujours : « rattrape une enseigne courte noyée
  // dans un nom candidat plus long ». Elle prend le maximum sur les paires de
  // jetons, donc appliquée à un nom qui en compte plusieurs, un unique mot
  // banal partagé emporte le score du nom ENTIER.
  //
  // Ce n'est pas théorique : mesuré sur le lot de calibration, « ACTIF
  // SERVICES » face à « Boulangerie Services » valait 1,00 — une boulangerie,
  // score de nom parfait, sur le seul « services ». Avec une catégorie qui
  // concorde et une adresse proche, cela franchissait le seuil et fusionnait
  // tout seul. C'est la pire panne possible de cet étage : un faux
  // appariement ne se voit pas dans les statistiques, il se voit au téléphone.
  //
  // Un nom de plusieurs mots a déjà sa mesure, `tokenContainment`, qui rend
  // la PROPORTION de jetons retrouvés — 0,5 pour un « services » sur deux —
  // au lieu du maximum. C'est elle qui doit décider dans ce cas.
  if (aTokens.length !== 1) return 0;

  let best = 0;
  for (const aToken of aTokens) {
    for (const bToken of bTokens) {
      if (Math.abs(aToken.length - bToken.length) > MAX_TOKEN_LENGTH_DIFF) continue;
      if (aTokens.length === 1 && aToken === bToken) continue;
      const short = aToken.length < MIN_FUZZY_TOKEN_LENGTH || bToken.length < MIN_FUZZY_TOKEN_LENGTH;
      if (short && !sameLetters(aToken, bToken)) continue;
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
  const targetCore = stripGenericTokens(candidateName, generic);
  let best: NameMatch = { score: 0, variant: null };

  for (const variant of variants) {
    const variantCore = stripGenericTokens(variant, generic);

    // Deux noms réduits chacun à un seul mot ne sont pas deux chaînes à
    // comparer : ce sont deux jetons, et les règles des jetons s'appliquent —
    // notamment le refus des extensions. Sans cette réserve, retirer le
    // métier rapprocherait « martin » de « martinez » au point de les rendre
    // comparables lettre à lettre, alors que le projet a justement décidé que
    // martin/martinez sont deux patronymes distincts. Le garde-fou de ratio
    // de longueur les séparait par accident, tant que le mot de métier
    // gonflait l'une des deux chaînes ; on le remplace ici par une règle qui
    // dit ce qu'elle fait.
    const bothSingleWords = !variantCore.includes(' ') && !targetCore.includes(' ');

    // Les deux noms sont le même, à un espace près : « RGSERVICES » et
    // « RG Services ». C'est l'agglutination elle-même qui fait preuve, et
    // elle échappe donc au plafond du jeton unique — la condition exige que
    // les chaînes DIFFÈRENT avant d'être recollées, faute de quoi « allard »
    // face à « allard » se hisserait à 1,00 par cette porte alors que le
    // projet a décidé qu'un patronyme seul ne vaut pas une identité.
    const exactlyAgglutinated =
      variantCore !== targetCore && despace(variantCore) === despace(targetCore);

    // Les deux noms sont le même nom, en entier et sans rien retirer.
    //
    // Le plafond du jeton unique refuse qu'un patronyme SEUL emporte la
    // décision quand le candidat porte une identité en plus — « Martin »
    // face à « Martin Dépannage ». Ici il n'y a pas d'identité en plus : rien
    // n'a été écarté d'un côté pour faire coïncider les deux. Plafonner
    // « IDEAL » face à « Ideal » reviendrait à punir la correspondance
    // parfaite, et c'est bien ce qui se produisait — 0,80 au lieu de 1,00.
    const identical = variant === target;

    // Partout ailleurs, le plafond du jeton unique tient, y compris sur les
    // mesures de chaîne entière : « martin » couvre le premier jeton entier
    // de « martin dupont », et sans plafond l'inclusion — ou la comparaison
    // sans espaces, qui atteint 0,90 — rendrait au patronyme l'identité que
    // `tokenContainment` lui refuse. Le nom candidat porte ici un second
    // jeton que la variante n'a pas : ce n'est pas le même nom.
    const singleToken = significantTokens(variant, generic).length === 1;
    const cap = (value: number): number =>
      singleToken ? Math.min(value, SINGLE_TOKEN_CAP) : value;

    // Proportion des mots distinctifs de la variante réellement retrouvés.
    // Elle sert de PLAFOND aux mesures de chaîne entière, qui sans elle
    // récompensent un long suffixe partagé sans regarder si la partie qui
    // distingue concorde. Mesuré : « NANTES HABITAT » face à « RENNES
    // HABITAT » atteignait 0,877 et fusionnait automatiquement — deux
    // entreprises de deux villes — et « MARTIN RENOVATION » face à « DURAND
    // RENOVATION » 0,859, deux artisans sans rapport.
    //
    // Le compromis est assumé : une faute de frappe portant sur tout le nom
    // n'atteindra plus le seuil de fusion et partira en revue. C'est le sens
    // de l'échange — un appariement manqué coûte une minute d'humain, un
    // faux appariement coûte l'appel.
    const coverage = tokenCoverage(variant, target, generic);
    const grounded = (value: number): number => Math.min(value, coverage);

    // Deux mesures échappent au plafond de couverture, et pour la même
    // raison : elles servent les cas où la couverture est légitimement nulle.
    // `bestTokenScore` rattrape l'enseigne d'un seul mot que le candidat
    // écrit autrement — « h20 » n'est pas dans « h2o plomberie ».
    // `agglutinatedContainment` rattrape l'enseigne recollée — « rgservices »
    // n'est dans aucun jeton de « plombier nantes rg services ». Les
    // plafonner par la couverture les annulerait toutes les deux.
    const score = Math.max(
      identical || exactlyAgglutinated ? 1 : 0,
      cap(agglutinatedContainment(variantCore, targetCore)),
      bestTokenScore(variant, target, generic),
      bothSingleWords ? 0 : cap(grounded(wholeStringScore(variantCore, targetCore))),
      bothSingleWords ? 0 : cap(grounded(wholeStringScore(despace(variantCore), despace(targetCore)))),
      grounded(tokenContainment(variant, target, generic)),
      grounded(tokenContainment(target, variant, generic)),
    );
    if (score > best.score) best = { score, variant };
  }
  return best;
}
