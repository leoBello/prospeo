import {
  normalizeCompanyName,
  normalizePhone,
  selectMatch,
  type MapsCandidate,
  type MatchingConfig,
  type MatchSubject,
  type ScoredCandidate,
  type Trade,
} from '@prospeo/core';
import { BlockedError, type MapsSource } from '../sources/google-maps.js';

/**
 * Une ligne de justification, recopiée en alias de type plutôt que reprise de
 * `MatchLine`.
 *
 * TypeScript n'accorde d'index signature implicite qu'aux alias de type, pas
 * aux interfaces : `MatchLine` étant une interface, un tableau de `MatchLine`
 * ne serait pas assignable au type `Json` de la colonne `jsonb` qui le
 * stocke. Même contrainte, et même remède, que `ScoreLine` dans
 * `packages/core`.
 */
type ReviewLine = { code: string; label: string; points: number };

/** Ce qu'on garde d'un candidat examiné, pour la revue et pour la calibration. */
export type ReviewCandidate = {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  mapsUrl: string;
  /**
   * Note Google et identifiant de lieu.
   *
   * Ils ne servent pas à trancher, mais ils doivent survivre à la revue : la
   * note alimente les points de vitalité du barème. Sans eux, un prospect
   * tranché à la main ressortirait moins bien noté qu'un prospect apparié
   * automatiquement — un biais qui pénaliserait précisément les cas douteux.
   */
  rating: number | null;
  placeId: string | null;
  /**
   * Coordonnées, catégorie, nombre d'avis : les entrées brutes du calcul.
   *
   * Elles n'ont aucun usage à l'affichage — personne ne tranche une revue sur
   * une latitude. Elles sont là pour que le calcul se **rejoue hors ligne**
   * sous d'autres seuils : sans elles, on ne stockerait que le verdict d'une
   * configuration, et réviser un seuil obligerait à rescraper Google. Avec
   * elles, un seul run sert à toutes les itérations de la calibration.
   */
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  reviewCount: number | null;
  confidence: number;
  lines: ReviewLine[];
  /**
   * Motif d'élimination sous la configuration du run, `null` si retenu.
   *
   * Absent des lignes écrites avant l'enregistrement complet : le lire
   * suppose donc de traiter `undefined` comme « inconnu », et non comme
   * « retenu ».
   */
  rejectedFor: 'distance' | 'confiance' | null;
};

export interface EnrichProspect {
  id: string;
  denomination: string;
  denominationUsuelle: string | null;
  city: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

/** Ce que l'étage écrit dans `prospect_enrichment`. */
export interface EnrichmentRow {
  prospect_id: string;
  source: string;
  matched_name: string | null;
  match_confidence: number | null;
  phone_e164: string | null;
  phone_kind: string | null;
  declared_url: string | null;
  // Pas de `social_urls` ici, volontairement : `enrich` ne peuple jamais cette
  // colonne, et la réécrire à `[]` à chaque upsert écraserait sur conflit une
  // donnée que cet étage ne connaît pas. L'omettre préserve la valeur
  // existante ; l'insertion reste valide, la colonne étant déclarée
  // `jsonb not null default '[]'::jsonb` dans la migration initiale.
  rating: number | null;
  review_count: number | null;
  place_id: string | null;
  maps_url: string | null;
  /**
   * Tout ce que l'appariement a examiné pour ce prospect.
   *
   * Rempli sur **tous** les statuts, éliminés compris et motif à l'appui, et
   * conservé par la revue sur toutes ses décisions — y compris le rejet.
   * Ce sont les exemples étiquetés dont la calibration des seuils a besoin :
   * ne les garder que sur `ambiguous` laissait deux de ses trois questions
   * sans réponse possible, et faisait repayer chaque révision de seuil en
   * requêtes Google. La présence de candidats ne dit donc rien du statut, et
   * n'est jamais à lire comme telle.
   */
  candidates: ReviewCandidate[];
  status: 'ok' | 'not_found' | 'ambiguous' | 'blocked';
  enriched_at: string;
}

const SOURCE = 'google_maps';

function emptyRow(prospectId: string, status: EnrichmentRow['status']): EnrichmentRow {
  return {
    prospect_id: prospectId,
    source: SOURCE,
    matched_name: null,
    match_confidence: null,
    phone_e164: null,
    phone_kind: null,
    declared_url: null,
    rating: null,
    review_count: null,
    place_id: null,
    maps_url: null,
    candidates: [],
    status,
    enriched_at: new Date().toISOString(),
  };
}

function forReview(scored: ScoredCandidate): ReviewCandidate {
  return {
    name: scored.candidate.name,
    address: scored.candidate.address,
    phone: scored.candidate.phone,
    website: scored.candidate.website,
    mapsUrl: scored.candidate.mapsUrl,
    rating: scored.candidate.rating,
    placeId: scored.candidate.placeId,
    latitude: scored.candidate.latitude,
    longitude: scored.candidate.longitude,
    category: scored.candidate.category,
    reviewCount: scored.candidate.reviewCount,
    confidence: scored.score.confidence,
    lines: scored.score.lines,
    rejectedFor: scored.rejectedFor,
  };
}

export function buildEnrichmentRow(
  prospect: EnrichProspect,
  candidates: readonly MapsCandidate[],
  trade: Trade,
  config: MatchingConfig,
): EnrichmentRow {
  const subject: MatchSubject = {
    denomination: prospect.denomination,
    denominationUsuelle: prospect.denominationUsuelle,
    latitude: prospect.latitude,
    longitude: prospect.longitude,
  };
  const outcome = selectMatch(subject, candidates, trade, config);

  // La trace est la même quel que soit le verdict : c'est ce qui permet de
  // rejuger les trois questions du jalon de calibration — fusion abusive,
  // évidence partie en revue, bon candidat éliminé par la distance — sur les
  // seules lignes de la base, sans rien redemander à Google.
  const examined = outcome.scored.map(forReview);

  if (outcome.kind === 'not_found') {
    const row = emptyRow(prospect.id, 'not_found');
    row.candidates = examined;
    return row;
  }

  if (outcome.kind === 'ambiguous') {
    // Aucune donnée de fiche n'est écrite. Un téléphone non validé serait
    // indiscernable d'un téléphone confirmé, et finirait composé.
    const row = emptyRow(prospect.id, 'ambiguous');
    row.candidates = examined;
    return row;
  }

  const phone = normalizePhone(outcome.candidate.phone);
  const row = emptyRow(prospect.id, 'ok');
  row.candidates = examined;
  row.matched_name = outcome.candidate.name;
  row.match_confidence = outcome.score.confidence;
  row.phone_e164 = phone?.e164 ?? null;
  row.phone_kind = phone?.kind ?? null;
  row.declared_url = outcome.candidate.website;
  row.rating = outcome.candidate.rating;
  row.review_count = outcome.candidate.reviewCount;
  row.place_id = outcome.candidate.placeId;
  row.maps_url = outcome.candidate.mapsUrl;
  return row;
}

export interface EnrichReport {
  processed: number;
  ok: number;
  ambiguous: number;
  notFound: number;
  /**
   * Échecs de **lecture** (Google). Isolés par nature : le prospect suivant
   * peut très bien réussir, donc le run continue.
   */
  failed: number;
  /**
   * Échecs d'**écriture** (Supabase). Comptés à part parce qu'ils ne sont pas
   * de la même famille : la ligne écrite est le seul point de reprise du run,
   * sans elle le prospect sera rescrapé au run suivant. Un run qui n'écrit
   * rien a brûlé du quota Google pour rien.
   */
  writeFailed: number;
  blocked: boolean;
  stoppedByCap: boolean;
  /** Run interrompu par une série d'échecs d'écriture : ce n'est plus un incident. */
  stoppedByWriteFailures: boolean;
  /**
   * Prospects dont aucune requête n'a rendu le moindre candidat.
   *
   * Compté même quand le run va jusqu'au bout : rapporté à `processed`, c'est
   * l'indicateur qui dit si le chemin de lecture fonctionne encore. Un run
   * sain en compte peu ; un run dont les sélecteurs sont cassés n'en compte
   * que ça.
   */
  emptySearches: number;
  /** Run interrompu sur une série de recherches vides : les sélecteurs sont suspects. */
  stoppedByEmptySearches: boolean;
}

export interface RunEnrichOptions {
  prospects: readonly EnrichProspect[];
  trade: Trade;
  config: MatchingConfig;
  /**
   * Volontairement réduit à `search` : l'étage ne ferme pas la source et ne
   * lit pas son compteur de navigations, c'est l'appelant qui les possède —
   * lui seul sait quand le run est fini. Exiger le `MapsSource` complet ne
   * ferait qu'obliger les appelants, tests compris, à fournir des membres que
   * cette fonction n'appelle jamais. Une source complète satisfait ce type.
   */
  source: Pick<MapsSource, 'search'>;
  upsert: (row: EnrichmentRow) => Promise<void>;
  /** Nombre de fiches encore autorisées aujourd'hui. */
  dailyRemaining: number;
}

/**
 * Ce qui fait qu'une fiche est la même fiche, d'une requête à l'autre.
 *
 * **Pas le `placeId` en premier**, contrairement à l'intuition. Maps rend la
 * même fiche sous deux URL selon d'où on la lit : celle d'une carte de
 * résultat ne porte pas de segment `!19s` et donne donc `placeId === null`,
 * celle du panneau de fiche en porte un. Mesuré sur le lot de calibration —
 * « Plombier Nantes RG Services » compté deux fois, une fois par forme.
 *
 * L'enjeu n'est pas l'esthétique du rapport. Deux exemplaires RETENUS d'une
 * même fiche sont deux candidats au-dessus du seuil haut, et `selectMatch`
 * refuse de trancher quand ils sont deux : le doublon empêcherait la fusion
 * qu'il décrit.
 *
 * Le nom normalisé et la position sont donc la clé, et le `placeId` ne sert
 * que de recours quand la position manque. Deux sociétés d'un même immeuble
 * portent des noms différents et restent distinctes.
 */
function placeIdentity(candidate: ReviewCandidate): string {
  if (candidate.latitude !== null && candidate.longitude !== null) {
    // Cinq décimales valent le mètre : au-delà, deux lectures de la même
    // fiche peuvent différer sur le dernier chiffre.
    return `${normalizeCompanyName(candidate.name)}@${candidate.latitude.toFixed(5)},${candidate.longitude.toFixed(5)}`;
  }
  return candidate.placeId ?? candidate.mapsUrl;
}

/** Requêtes tentées dans l'ordre ; l'enseigne d'abord, c'est elle que Maps connaît. */
function queriesFor(prospect: EnrichProspect, trade: Trade): string[] {
  const queries: string[] = [];
  if (prospect.denominationUsuelle !== null) {
    queries.push(`"${prospect.denominationUsuelle}" ${prospect.city}`);
  }
  queries.push(`"${prospect.denomination}" ${prospect.city}`);
  const fallback = trade.mapsQueries[0] ?? trade.slug;
  queries.push(`${fallback} ${prospect.address}`);
  return queries;
}

/**
 * Nombre d'échecs d'écriture consécutifs au-delà duquel le run s'interrompt.
 *
 * Un échec isolé arrive ; trois d'affilée ne sont plus un incident mais une
 * panne — migration non poussée sur l'environnement, clé sans droit
 * d'écriture. Continuer ne ferait que scraper Google pour jeter le résultat.
 */
const MAX_CONSECUTIVE_WRITE_FAILURES = 3;

/**
 * Prospects d'affilée dont AUCUNE requête n'a rendu le moindre candidat
 * avant que le run se déclare en panne de lecture.
 *
 * C'est le garde-fou contre la panne la plus coûteuse de ce chantier, et la
 * seule qui soit entièrement muette. Si Google renomme une classe, tous les
 * sélecteurs rendent `null`, `search()` rend un tableau vide sans lever la
 * moindre erreur, et chaque prospect ressort `not_found` : le run traite ses
 * 420 lignes, écrit 420 verdicts faux, annonce « 420 introuvables » et sort
 * en succès. Aucun test hors ligne ne peut détecter cela — une fixture fige
 * le HTML d'hier, elle ne sait rien de celui de demain. Seul le run lui-même
 * est en position de s'en apercevoir.
 *
 * Le compteur porte sur les recherches **vides**, pas sur les `not_found` :
 * la distinction est ce qui rend le seuil utilisable. Un `not_found`
 * légitime naît de fiches trouvées puis écartées par `selectMatch` — le
 * chemin de lecture a donc fonctionné, et ce prospect remet le compteur à
 * zéro. Seule l'absence totale de candidat, sur les trois requêtes d'un
 * prospect, porte la signature d'un sélecteur cassé.
 *
 * Quinze : au-delà du plus gros lot où une série d'absents réels reste
 * plausible, et bien en deçà du prix d'un run complet. Le lot de calibration
 * en compte cinq, il ne peut donc pas le déclencher.
 */
const MAX_CONSECUTIVE_EMPTY_SEARCHES = 15;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Joue les requêtes dans l'ordre et rend la ligne à écrire.
 *
 * L'arrêt se fait à la première requête dont le statut n'est **pas**
 * `not_found`, et non à la première qui rend des candidats : la règle du
 * projet est « arrêt à la première requête qui produit un candidat *retenu* ».
 * La nuance décide du résultat. Une dénomination usuelle générique — « AZUR »
 * — rend volontiers cinq fiches sans rapport que `selectMatch` écarte toutes ;
 * s'arrêter là condamnerait le prospect à `not_found` sans jamais essayer la
 * raison sociale exacte, celle qui aurait trouvé la bonne fiche. Et le verdict
 * serait définitif, `not_found` n'étant pas rejoué sans `--retry-not-found`.
 */
async function searchAndBuild(
  prospect: EnrichProspect,
  options: RunEnrichOptions,
): Promise<{ row: EnrichmentRow; sawCandidate: boolean }> {
  let row: EnrichmentRow | null = null;
  let sawCandidate = false;

  // Les fiches vues par TOUTES les requêtes, et pas seulement par celle qui
  // a tranché. Une requête qui n'a rien retenu a tout de même pu croiser la
  // bonne fiche et l'écarter d'un cheveu : c'est exactement le candidat que
  // la calibration voudra réexaminer en desserrant un seuil, et il
  // disparaissait quand seule la dernière ligne construite survivait.
  // Déduplication sur l'identité du lieu — deux requêtes rendent volontiers
  // la même fiche, et le score ne dépend pas de la requête qui l'a trouvée.
  const seen = new Map<string, ReviewCandidate>();
  const remember = (candidates: readonly ReviewCandidate[]): void => {
    for (const found of candidates) {
      const key = placeIdentity(found);
      const previous = seen.get(key);
      // À égalité d'identité, on garde l'exemplaire identifié : le `placeId`
      // rattache la fiche à un lieu de façon stable, là où l'URL d'une carte
      // de résultat porte le centre de la vue et rien d'autre.
      if (previous === undefined || (previous.placeId === null && found.placeId !== null)) {
        seen.set(key, found);
      }
    }
  };

  for (const query of queriesFor(prospect, options.trade)) {
    const candidates: MapsCandidate[] = await options.source.search(query);
    // Une requête sans aucun candidat n'a rien à apparier : inutile de la
    // scorer, la requête suivante a toutes ses chances.
    if (candidates.length === 0) continue;
    sawCandidate = true;
    row = buildEnrichmentRow(prospect, candidates, options.trade, options.config);
    remember(row.candidates);
    if (row.status !== 'not_found') break;
  }

  // Toutes les requêtes ont rendu `not_found` : on garde la dernière ligne
  // construite, ou une ligne vide si aucune n'a rendu le moindre candidat.
  // Le VERDICT reste celui de la requête qui a tranché — seule la trace est
  // élargie, et elle n'entre dans aucune décision de cet étage.
  const settled = row ?? emptyRow(prospect.id, 'not_found');
  settled.candidates = [...seen.values()].sort((a, b) => b.confidence - a.confidence);
  return { row: settled, sawCandidate };
}

export async function runEnrich(options: RunEnrichOptions): Promise<EnrichReport> {
  const report: EnrichReport = {
    processed: 0,
    ok: 0,
    ambiguous: 0,
    notFound: 0,
    failed: 0,
    writeFailed: 0,
    blocked: false,
    stoppedByCap: false,
    stoppedByWriteFailures: false,
    emptySearches: 0,
    stoppedByEmptySearches: false,
  };

  let consecutiveWriteFailures = 0;
  let consecutiveEmptySearches = 0;

  for (const prospect of options.prospects) {
    if (report.processed >= options.dailyRemaining) {
      report.stoppedByCap = true;
      break;
    }

    // Lecture et écriture sont dans deux `try` distincts, parce que les deux
    // échecs ne se traitent pas pareil : un échec de lecture est isolé, un
    // échec d'écriture rompt l'invariant du run.
    let row: EnrichmentRow;
    let sawCandidate: boolean;
    try {
      ({ row, sawCandidate } = await searchAndBuild(prospect, options));
    } catch (error) {
      if (error instanceof BlockedError) {
        // Le run s'arrête net. Continuer martèlerait une protection qui vient
        // de se déclencher, ce qui la durcit et remplit la base de fiches
        // vides indiscernables de vraies absences.
        //
        // Le drapeau est posé AVANT l'écriture : le blocage est un fait
        // constaté, il ne doit pas dépendre de la réussite de sa persistance.
        // Laisser l'exception d'écriture remonter ferait sortir le CLI en 1 au
        // lieu de 2, sans message d'arrêt — indiscernable d'une erreur
        // d'usage, et une automatisation qui relance sur 1 repartirait droit
        // dans la protection anti-bot.
        report.blocked = true;
        try {
          await options.upsert(emptyRow(prospect.id, 'blocked'));
        } catch (writeError) {
          report.writeFailed += 1;
          process.stderr.write(
            `enrich: échec d'écriture de la ligne blocked sur ${prospect.id} — ${messageOf(writeError)}\n`,
          );
        }
        break;
      }
      report.failed += 1;
      process.stderr.write(
        `enrich: échec de lecture sur ${prospect.id} — ${messageOf(error)}\n`,
      );
      continue;
    }

    try {
      await options.upsert(row);
    } catch (error) {
      report.writeFailed += 1;
      consecutiveWriteFailures += 1;
      process.stderr.write(
        `enrich: échec d'écriture sur ${prospect.id} — ${messageOf(error)}\n`,
      );
      if (consecutiveWriteFailures >= MAX_CONSECUTIVE_WRITE_FAILURES) {
        report.stoppedByWriteFailures = true;
        break;
      }
      continue;
    }
    consecutiveWriteFailures = 0;

    report.processed += 1;
    if (row.status === 'ok') report.ok += 1;
    else if (row.status === 'ambiguous') report.ambiguous += 1;
    else report.notFound += 1;

    // Le décompte se fait après l'écriture, donc les lignes suspectes sont
    // bel et bien en base quand le run s'arrête. C'est assumé : on ne peut
    // pas savoir qu'une recherche vide est fausse avant d'en avoir vu la
    // série. Elles restent rattrapables — `not_found` se rejoue avec
    // `--retry-not-found` — et c'est ce que dit le message d'arrêt. Ce que
    // le garde-fou empêche, c'est d'en écrire quatre cents de plus et de
    // présenter le tout comme un succès.
    if (!sawCandidate) {
      report.emptySearches += 1;
      consecutiveEmptySearches += 1;
      if (consecutiveEmptySearches >= MAX_CONSECUTIVE_EMPTY_SEARCHES) {
        report.stoppedByEmptySearches = true;
        break;
      }
    } else {
      // Une seule fiche lue suffit à prouver que le chemin de lecture tient :
      // le soupçon tombe entièrement.
      consecutiveEmptySearches = 0;
    }
  }

  return report;
}
