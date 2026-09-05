/**
 * Comparaison d'adresses postales — la seconde voie de l'appariement.
 *
 * Le voisin de `name-match.ts`, et pour une raison précise : le nom vaut ~0
 * sur la population des artisans. Le SIRET dit `SARL ALLARD`, Google Maps
 * affiche `AB Plomberie` ; le nom légal et le nom commercial n'ont le plus
 * souvent rien à voir. L'adresse, elle, existe des deux côtés et ne ment pas —
 * et « même numéro, même rue, même code postal » est une preuve d'une autre
 * nature que « 300 mètres », surtout indépendante du nom.
 */

import { CATEGORIES_BATIMENT } from './trades.js';

export interface AdressePostale {
  /** Numéro de voie, suffixe retiré : « 71 » pour « 71b ». */
  numero: string | null;
  /** Mots de la voie, normalisés, type de voie et mots-outils retirés. */
  motsVoie: string[];
  /** Code postal à cinq chiffres. */
  codePostal: string | null;
}

/**
 * Types de voie, abréviations comprises.
 *
 * Ils jouent deux rôles à la fois, et c'est voulu : ils **ancrent** la lecture
 * — le numéro de voie est celui qui les précède, ce qui écarte les numéros de
 * bureau, d'étage et d'appartement — puis ils **s'effacent**, parce qu'un type
 * de voie ne porte aucune identité. `AVENUE` et `Av.` désignent la même chose,
 * et il ne faut pas que l'écriture décide.
 *
 * Conséquence assumée : `3 rue Victor Hugo` et `3 avenue Victor Hugo` dans le
 * même code postal se confondent. Le cas est rare, et le test de catégorie
 * puis la règle du doute (A3, A4) doivent encore tenir derrière.
 */
const TYPES_DE_VOIE = new Set([
  'rue', 'avenue', 'av', 'ave', 'boulevard', 'bd', 'bld', 'blvd',
  'place', 'pl', 'route', 'rte', 'chemin', 'chem',
  'impasse', 'imp', 'allee', 'allees', 'quai', 'cours',
  'square', 'passage', 'villa', 'venelle', 'esplanade', 'promenade',
  'parvis', 'faubourg', 'fbg', 'mail', 'sentier', 'voie', 'rond',
]);

/**
 * Mots-outils et articles, retirés de la voie.
 *
 * `DES`, `DE`, `DU`, `LA`, `ET` figurent dans presque toutes les adresses :
 * **les laisser dans la comparaison suffit à tout apparier avec tout.** C'est
 * exactement ce qui a produit la mesure fausse de l'investigation, où
 * `9 avenue Général Marchand` a été apparié à `9 rue Kléber`.
 */
const MOTS_OUTILS = new Set([
  'de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'a', 'au', 'aux', 'en', 'sur', 'sous',
]);

/**
 * Suffixes de numéro : `30 BIS` et `30 B` désignent le même immeuble que `30`.
 *
 * Les lettres isolées sont traitées à part, dans `numeroAvant` : les énumérer
 * ici reviendrait à écrire l'alphabet.
 */
const SUFFIXES_DE_NUMERO = new Set(['bis', 'ter', 'quater', 'quinquies']);

/**
 * Réduction d'un texte à des jetons comparables.
 *
 * `normalizeCompanyName` n'est **pas** réutilisée ici, bien qu'elle fasse
 * presque cela : elle retire les formes juridiques — `sa`, `sel`, `ei`, `ets` —
 * ce qui est une règle de raison sociale et n'a rien à faire dans une adresse,
 * où ces suites de lettres sont des mots de rue comme les autres.
 */
function reduire(valeur: string): string[] {
  return valeur
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((jeton) => jeton !== '');
}

/**
 * Le nombre qui précède l'ancre, en sautant un éventuel suffixe.
 *
 * On ne remonte que de deux jetons : au-delà, ce n'est plus le numéro de la
 * voie mais le numéro de quelque chose d'autre — précisément ce que cette
 * fonction existe pour ne pas ramasser.
 */
function numeroAvant(jetons: readonly string[], ancre: number): string | null {
  for (let index = ancre - 1; index >= 0 && ancre - index <= 2; index -= 1) {
    const jeton = jetons[index] ?? '';
    if (SUFFIXES_DE_NUMERO.has(jeton) || /^[a-z]$/.test(jeton)) continue;
    return /^(\d+)[a-z]?$/.exec(jeton)?.[1] ?? null;
  }
  return null;
}

/**
 * Lit une adresse écrite d'un côté ou de l'autre, et n'en garde que ce qui
 * identifie un point.
 *
 * Les deux côtés passent par ici, et c'est la condition pour que la
 * comparaison soit honnête : `211 ROUTE DE SAINTE LUCE 44300 NANTES` et
 * `211 Rte de Sainte-Luce, 44300 Nantes` doivent rendre la même chose.
 */
export function normaliserAdresse(brut: string | null): AdressePostale {
  const vide: AdressePostale = { numero: null, motsVoie: [], codePostal: null };
  if (brut === null) return vide;

  const jetons = reduire(brut);
  if (jetons.length === 0) return vide;

  // Le DERNIER groupe de cinq chiffres, et non le premier : une adresse Maps
  // porte volontiers un « CS 22201 » avant son vrai code postal, et c'est le
  // dernier qui est suivi du nom de commune.
  let iCodePostal = -1;
  for (let index = jetons.length - 1; index >= 0; index -= 1) {
    if (/^\d{5}$/.test(jetons[index] ?? '')) {
      iCodePostal = index;
      break;
    }
  }
  const codePostal = iCodePostal === -1 ? null : (jetons[iCodePostal] ?? null);
  const fin = iCodePostal === -1 ? jetons.length : iCodePostal;

  // L'ancre est le premier type de voie RÉELLEMENT PRÉCÉDÉ D'UN NUMÉRO. La
  // condition n'est pas décorative : « RESIDENCE LES ALLEES 12 RUE X » porte
  // deux types de voie, et seul le second ouvre la vraie adresse.
  let ancre = -1;
  let numero: string | null = null;
  for (let index = 0; index < fin; index += 1) {
    if (!TYPES_DE_VOIE.has(jetons[index] ?? '')) continue;
    const trouve = numeroAvant(jetons, index);
    if (trouve === null) continue;
    ancre = index;
    numero = trouve;
    break;
  }
  if (ancre === -1) return { numero: null, motsVoie: [], codePostal };

  const motsVoie = jetons.slice(ancre + 1, fin).filter((jeton) => !MOTS_OUTILS.has(jeton));
  return { numero, motsVoie, codePostal };
}

/**
 * Les deux adresses désignent-elles le même point ?
 *
 * **L'ordre des arguments compte.** La relation testée est l'*inclusion* des
 * mots de voie du côté Maps dans ceux du côté SIRET, et non l'égalité : le
 * SIRET porte souvent des mots que Maps n'a pas — une zone d'activité, un
 * bâtiment — alors que l'inverse ne se produit pas. Un mot en plus du côté
 * Maps est donc un mot que le SIRET ne confirme pas, et il fait échouer la
 * comparaison.
 *
 * « Un mot en commun » aurait été bien plus permissif, et c'est exactement ce
 * qui a apparié `9 avenue Général Marchand` à `9 rue Kléber` pendant
 * l'investigation.
 *
 * Une voie Maps sans aucun mot fait échouer aussi : l'inclusion d'un ensemble
 * vide est toujours vraie, et le numéro seul suffirait alors à apparier.
 */
export function memeAdresse(siret: AdressePostale, maps: AdressePostale): boolean {
  if (siret.numero === null || siret.numero !== maps.numero) return false;
  if (siret.codePostal === null || siret.codePostal !== maps.codePostal) return false;
  if (maps.motsVoie.length === 0) return false;
  const connus = new Set(siret.motsVoie);
  return maps.motsVoie.every((mot) => connus.has(mot));
}

/**
 * Le libellé de catégorie Google désigne-t-il **un** métier du bâtiment ?
 *
 * Distinct de `matchesCategory`, qui demande « est-ce le métier cherché ? » et
 * garde ce sens partout ailleurs. Cette lecture élargie ne vaut que dans la
 * voie adresse, où elle est adossée à une preuve forte — le même numéro, la
 * même rue, le même code postal. C'est ce qui sépare la boulangerie du même
 * immeuble, qui est un faux positif, du serrurier-plombier classé sous
 * l'étiquette voisine, qui est un faux négatif.
 *
 * La comparaison est **mot à mot**, et non par inclusion de chaîne comme le
 * fait `matchesCategory` : un métier de la liste ne confirme rien s'il n'est
 * qu'un fragment d'un mot plus long. Aucune catégorie Google observée ne
 * distingue aujourd'hui les deux règles — la garantie est structurelle, pas
 * mesurée — mais elle est gratuite, et c'est le sens de l'échange : la liste
 * s'élargira, et le jour où elle accueillera un mot court, l'inclusion de
 * chaîne l'aurait fait confirmer n'importe quoi.
 */
export function estCategorieBatiment(categorie: string | null): boolean {
  if (categorie === null) return false;
  const mots = new Set(reduire(categorie));
  if (mots.size === 0) return false;
  return CATEGORIES_BATIMENT.some((metier) => mots.has(metier));
}
