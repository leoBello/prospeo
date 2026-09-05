import { estCategorieBatiment, memeAdresse, normaliserAdresse } from './address-match.js';
import { bestNameMatch, nameVariants } from './name-match.js';
import { normalizeCompanyName } from './normalize.js';
import type { Trade } from './types.js';

/** Rayon moyen de la Terre, en mètres. */
const EARTH_RADIUS_M = 6_371_000;

/** Ce dont l'appariement a besoin, côté Sirene. */
export interface MatchSubject {
  denomination: string;
  denominationUsuelle: string | null;
  /**
   * L'adresse déclarée à Sirene, code postal compris.
   *
   * Requise et non facultative : un champ optionnel se serait oublié chez un
   * appelant, et la voie adresse aurait été inerte sans que rien ne le dise.
   * `null` est une absence qui se nomme, et qui referme simplement la voie.
   */
  address: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** Une fiche Google Maps, telle qu'extraite et normalisée. */
export interface MapsCandidate {
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  placeId: string | null;
  mapsUrl: string;
}

/** Une ligne de justification, affichable telle quelle. */
export interface MatchLine {
  code: 'nom' | 'distance' | 'categorie' | 'adresse';
  label: string;
  /** Contribution effective à la confiance, déjà pondérée. */
  points: number;
}

export interface MatchScore {
  /** 0 à 1. */
  confidence: number;
  nameSimilarity: number;
  /** La variante de nom qui a emporté la décision. */
  matchedVariant: string | null;
  /** `null` quand une des deux positions manque. */
  distanceM: number | null;
  categoryMatch: boolean;
  /** Le numéro, la voie et le code postal coïncident des deux côtés. */
  sameAddress: boolean;
  /**
   * …et la catégorie Google est un métier du bâtiment : la voie adresse peut
   * trancher sur ce candidat. Implique toujours `sameAddress`.
   */
  addressMatch: boolean;
  lines: MatchLine[];
}

/**
 * Pourquoi un candidat n'a pas participé à la décision.
 *
 * `'distance'` : au-delà de `maxDistanceM`, donc écarté quel que soit son nom.
 * `'confiance'` : sous `lowThreshold`, donc trop faible pour valoir un doute.
 */
export type Elimination = 'distance' | 'confiance';

export interface ScoredCandidate {
  candidate: MapsCandidate;
  score: MatchScore;
  /** `null` quand le candidat a participé à la décision. */
  rejectedFor: Elimination | null;
}

/**
 * Le verdict, et **tout** ce qui a été examiné pour l'atteindre.
 *
 * `scored` porte les candidats éliminés autant que les retenus, chacun avec
 * son motif. C'est ce qui rend les seuils calibrables : « ce candidat-ci
 * était le bon, et c'est la distance qui l'a écarté » ne se constate pas sur
 * une liste d'où les éliminés ont disparu. Sans cette trace, tout changement
 * de seuil se repaierait en requêtes Google, puisque la pièce à conviction
 * aurait été jetée avant d'être écrite.
 */
export type MatchOutcome =
  | {
      kind: 'ok';
      candidate: MapsCandidate;
      score: MatchScore;
      scored: ScoredCandidate[];
      /**
       * Ce qui a emporté la décision.
       *
       * Deux voies mènent à une fusion et elles ne se valent pas à la
       * relecture : `'score'` dit que le nom, la distance et la catégorie ont
       * franchi le seuil ; `'adresse'` dit que la confiance est restée basse
       * et que c'est l'adresse postale exacte, plus un métier du bâtiment,
       * qui a tranché. Un opérateur qui relit six mois plus tard doit pouvoir
       * les distinguer sans relire le code.
       */
      via: 'score' | 'adresse';
    }
  | { kind: 'ambiguous'; scored: ScoredCandidate[] }
  | { kind: 'not_found'; scored: ScoredCandidate[] };

export interface MatchingConfig {
  version: string;
  nameWeight: number;
  distanceWeight: number;
  categoryWeight: number;
  /** Au-delà, le candidat est éliminé quel que soit son nom. */
  maxDistanceM: number;
  highThreshold: number;
  lowThreshold: number;
}

/**
 * Réglages de l'appariement, v2 — premier tour de calibration sur données
 * réelles.
 *
 * **La catégorie passe de 0,15 à 0,10, le nom de 0,60 à 0,65.** Ce n'est pas
 * un ajustement de confort : à 0,15, le maximum atteignable sans catégorie
 * confirmée valait `nameWeight + distanceWeight` = 0,85, soit exactement
 * `highThreshold`, et seulement à nom parfait et distance nulle. Toute fiche
 * dont Google omet ou se trompe la catégorie était donc structurellement
 * inéligible à la fusion automatique. Mesuré sur le premier lot : « IDEAL »
 * face à la fiche « Ideal » à 1 mètre atteignait 0,849 et partait en revue ;
 * « DIRECT ASSISTANCE » face à « Direct Assistance » à 7 mètres, 0,844.
 *
 * Alléger la catégorie plutôt qu'abaisser le seuil traite la cause. Le
 * libellé Google est peu fiable sur cette population — « Ideal », plombier,
 * y est classé « Électricien », exactement le décalage déjà documenté pour
 * le code NAF de l'établissement. Baisser le seuil aurait abaissé la barre
 * pour tout le monde sans rien corriger du signal fautif.
 *
 * **`maxDistanceM` passe de 300 à 1 000 m (v3), mesuré sur les 139 prospects
 * de Nantes entière.** La valeur de 300 postulait que l'adresse déclarée à
 * Sirene et la position de la fiche Google coïncident. Elles ne coïncident
 * pas : chez un artisan, Sirene enregistre souvent le domicile ou l'adresse
 * du comptable, quand Maps géocode le local commercial.
 *
 * Balayage hors ligne sur la population complète, sans une requête Google :
 *
 *     rayon      fusions   à trancher   introuvables
 *     300 m         35          9            95
 *     1 000 m       39         10            90
 *     2 000 m       39         21            79
 *     3 000 m       39         29            71
 *
 * Quatre fusions gagnées pour un seul cas de revue supplémentaire, et cinq
 * introuvables récupérés. Au-delà de 1 000 m le gain s'arrête net — plus
 * aucune fusion — tandis que la file de revue double puis triple : c'est du
 * travail humain acheté sans rien en retour.
 *
 * Les quatre fusions gagnées ont été vérifiées une par une, parce que le prix
 * d'une fusion fausse n'est pas celui d'un appariement manqué : inversions
 * prénom/nom que Sirene et Maps écrivent dans l'ordre inverse (« LUCIAN
 * LAZA » / « Laza Lucian », « MOHAMMED BOUCENNA » / « Boucenna Mohammed »),
 * une enseigne à 25 m (« TSM »), une raison sociale identique à 73 m
 * (« ATLANTIK HOME »). Aucune n'est douteuse.
 *
 * Ce réglage se révise hors ligne : les 676 candidats que le rayon écarte
 * restent enregistrés avec leurs coordonnées, et `calibrate --apply` propage
 * tout changement sans rescraper.
 */
export const MATCHING_CONFIG: MatchingConfig = {
  version: 'v3',
  nameWeight: 0.65,
  distanceWeight: 0.25,
  categoryWeight: 0.1,
  maxDistanceM: 1000,
  highThreshold: 0.85,
  lowThreshold: 0.55,
};

/** Distance orthodromique en mètres. */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Jetons de métier trop génériques pour porter une identité d'entreprise. */
function genericTokens(trade: Trade): string[] {
  return [trade.slug, trade.label, ...trade.keywords, ...trade.mapsQueries].flatMap((word) =>
    normalizeCompanyName(word).split(' '),
  );
}

/**
 * Le libellé de catégorie Google recoupe-t-il le métier attendu ?
 *
 * Se limite à `categoryLabels`, volontairement plus étroit que `keywords` :
 * `keywords` contient des mots comme « dépannage », choisis pour être
 * fréquents dans les noms d'artisans — ce qui en fait le pire discriminant
 * de catégorie possible, puisqu'il qualifie tout autant l'électroménager,
 * l'informatique ou l'automobile.
 */
function matchesCategory(category: string | null, trade: Trade): boolean {
  if (category === null) return false;
  const normalized = normalizeCompanyName(category);
  if (normalized === '') return false;
  return trade.categoryLabels.some((word) => {
    const target = normalizeCompanyName(word);
    return target !== '' && normalized.includes(target);
  });
}


export function scoreCandidate(
  subject: MatchSubject,
  candidate: MapsCandidate,
  trade: Trade,
  config: MatchingConfig,
): MatchScore {
  const generic = genericTokens(trade);
  const variants = nameVariants(subject.denomination, subject.denominationUsuelle);
  const name = bestNameMatch(variants, candidate.name, generic);

  const distanceM =
    subject.latitude === null ||
    subject.longitude === null ||
    candidate.latitude === null ||
    candidate.longitude === null
      ? null
      : haversineMeters(
          subject.latitude,
          subject.longitude,
          candidate.latitude,
          candidate.longitude,
        );

  // Une distance inconnue ne vaut ni bonus ni malus : elle ne prouve rien.
  const proximity =
    distanceM === null
      ? 0
      : Math.max(0, 1 - Math.min(distanceM, config.maxDistanceM) / config.maxDistanceM);

  const categoryMatch = matchesCategory(candidate.category, trade);

  const sameAddress = memeAdresse(
    normaliserAdresse(subject.address),
    normaliserAdresse(candidate.address),
  );
  const addressMatch = sameAddress && estCategorieBatiment(candidate.category);

  const namePoints = config.nameWeight * name.score;
  const distancePoints = config.distanceWeight * proximity;
  const categoryPoints = config.categoryWeight * (categoryMatch ? 1 : 0);

  const lines: MatchLine[] = [
    {
      code: 'nom',
      label:
        name.variant === null
          ? 'nom : aucune variante exploitable'
          : `nom ${name.score.toFixed(2)} via « ${name.variant} »`,
      points: namePoints,
    },
    {
      code: 'distance',
      label: distanceM === null ? 'distance inconnue' : `${Math.round(distanceM)} m`,
      points: distancePoints,
    },
    {
      code: 'categorie',
      label:
        candidate.category === null
          ? 'catégorie absente'
          : `catégorie « ${candidate.category} »${categoryMatch ? ' ✓' : ' ✗'}`,
      points: categoryPoints,
    },
  ];

  // La ligne n'apparaît que quand l'adresse coïncide : sur les candidats où
  // elle ne dit rien, elle n'encombrerait que la trace. Elle porte **zéro
  // point**, et ce n'est pas un oubli — la voie adresse décide à côté du
  // score, jamais dedans. Lui donner un poids la ferait franchir des seuils,
  // donc produire des `ambiguous`, ce que A1 lui interdit formellement :
  // elle n'ajoute que des fusions, elle n'envoie rien en revue.
  if (sameAddress) {
    const fiche = candidate.address ?? '';
    // Trois libellés et non deux : « catégorie connue, hors bâtiment » et
    // « catégorie que Google n'a pas rendue » sont deux absences de natures
    // différentes, et la seconde ne permet d'affirmer aucun refus.
    const verdict =
      addressMatch
        ? 'métier du bâtiment ✓'
        : candidate.category === null
          ? 'catégorie inconnue ?'
          : `catégorie « ${candidate.category} » hors bâtiment ✗`;
    lines.push({
      code: 'adresse',
      label: `adresse identique « ${fiche} » — ${verdict}`,
      points: 0,
    });
  }

  return {
    confidence: namePoints + distancePoints + categoryPoints,
    nameSimilarity: name.score,
    matchedVariant: name.variant,
    distanceM,
    categoryMatch,
    sameAddress,
    addressMatch,
    lines,
  };
}

/**
 * Choisit un candidat, ou refuse de choisir.
 *
 * Deux candidats au-dessus du seuil haut ne fusionnent jamais : quand deux
 * fiches se disputent un prospect, la confiance élevée est le symptôme du
 * problème, pas sa résolution. Un faux appariement ne se voit pas dans les
 * statistiques — il se voit au téléphone, et l'appel est perdu.
 */
export function selectMatch(
  subject: MatchSubject,
  candidates: readonly MapsCandidate[],
  trade: Trade,
  config: MatchingConfig,
): MatchOutcome {
  const scored: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const score = scoreCandidate(subject, candidate, trade, config);
    // Au-delà de la distance maximale, deux homonymes sont deux entreprises.
    // Le candidat est marqué, pas jeté : la décision l'ignore, la trace le
    // garde. L'ordre des deux motifs est significatif — la distance prime,
    // parce qu'elle disqualifie indépendamment de la confiance atteinte.
    const rejectedFor: Elimination | null =
      score.distanceM !== null && score.distanceM > config.maxDistanceM
        ? 'distance'
        : score.confidence < config.lowThreshold
          ? 'confiance'
          : null;
    scored.push({ candidate, score, rejectedFor });
  }

  // Tri sur la liste entière, éliminés compris : la trace se lit du plus
  // probable au moins probable, et l'ordre relatif des retenus est le même
  // qu'avant puisque le tri est stable sur une même clé.
  scored.sort((a, b) => b.score.confidence - a.score.confidence);
  const retained = scored.filter((s) => s.rejectedFor === null);

  // La voie adresse — et **seulement ici**, dans la branche où le score n'a
  // rien retenu. Elle ne peut donc que transformer un `not_found` en `ok` :
  // elle ne retire aucune fusion, ne dégrade aucun verdict, et n'envoie rien
  // de neuf en revue (A1). Le nom vaut ~0 sur cette population, l'adresse
  // exacte est une preuve d'une autre nature — et indépendante du nom, qui
  // est précisément le signal défaillant.
  //
  // Elle regarde TOUS les candidats, y compris ceux que le rayon a écartés :
  // quand le numéro, la rue et le code postal coïncident, un désaccord de
  // coordonnées dit qu'un des deux géocodages est faux, pas que ce sont deux
  // entreprises. Le rayon, lui, ne bouge pas — le score reste ce qu'il est.
  if (retained.length === 0) {
    // Deux artisans du bâtiment partageant un local produiraient deux
    // candidats également crédibles : choisir le premier serait choisir au
    // hasard. Le doute se constate tout seul et se retire (A4) — le
    // propriétaire ne veut pas arbitrer, et une file de revue transformerait
    // un gain en corvée.
    //
    // Un rival est un candidat à la même adresse **qu'on ne peut pas
    // exclure** : soit il est du bâtiment, soit Google n'a pas rendu sa
    // catégorie. Ne compter que les premiers ferait d'une absence un « non »,
    // et effacerait le doute au lieu de le constater — la fiche sans
    // catégorie est justement celle dont on ignore si c'est la bonne.
    const rivaux = scored.filter(
      (s) => s.score.sameAddress && (s.score.addressMatch || s.candidate.category === null),
    );
    const seul = rivaux.length === 1 ? rivaux[0] : undefined;
    // …et le seul rival restant doit être prouvé du bâtiment pour emporter la
    // fusion : « je ne peux pas t'exclure » n'a jamais valu « c'est toi ».
    if (seul !== undefined && seul.score.addressMatch) {
      return { kind: 'ok', candidate: seul.candidate, score: seul.score, scored, via: 'adresse' };
    }
    return { kind: 'not_found', scored };
  }

  const confident = retained.filter((s) => s.score.confidence >= config.highThreshold);

  if (confident.length === 1) {
    const only = confident[0];
    if (only === undefined) return { kind: 'not_found', scored };
    return { kind: 'ok', candidate: only.candidate, score: only.score, scored, via: 'score' };
  }

  return { kind: 'ambiguous', scored };
}
