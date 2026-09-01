/**
 * Pagination des lectures PostgREST.
 *
 * PostgREST plafonne toute réponse à `max_rows`. La conséquence est plus
 * vicieuse qu'une simple limite : la réponse tronquée est un HTTP 200
 * parfaitement valide, sans avertissement ni marqueur. Une lecture nue de
 * `prospect` rendrait donc les mille premières lignes et l'interface les
 * présenterait comme la totalité de la base — elle ne planterait pas, elle
 * mentirait. Ce module est le seul chemin de lecture autorisé pour les
 * collections.
 */

/**
 * Plafond `max_rows` du serveur, valeur par défaut de Supabase.
 *
 * S'il était abaissé côté serveur, ce module continuerait de fonctionner :
 * il détecte la fin des données sur le nombre de lignes *reçues*, jamais sur
 * le nombre demandé. Seule la constante deviendrait optimiste, sans
 * conséquence sur l'exhaustivité.
 */
export const POSTGREST_MAX_ROWS = 1000;

/**
 * Garde-fou d'emballement. Une lecture qui dépasse ce volume est un bug de
 * requête (filtre oublié, jointure explosive) ou un serveur qui ne rend
 * jamais de page incomplète — pas un cas nominal sur une base de prospection.
 */
const DEFAULT_HARD_LIMIT = 100_000;

/** Ce que rend `.range()` de supabase-js, réduit à ce dont on dépend. */
export interface PageResponse<T> {
  data: T[] | null;
  error: { message: string } | null;
}

/**
 * Lit la tranche **fermée** `[from, to]`, bornes incluses, comme
 * `.range(from, to)` de PostgREST.
 *
 * Le contrat impose un ordre total et déterministe côté serveur — un
 * `order` sur une colonne unique, ou complété par la clé primaire. Sans lui,
 * deux lignes de même rang peuvent changer de place entre deux requêtes :
 * l'une serait lue deux fois, l'autre jamais, et le résultat aurait la bonne
 * taille tout en étant faux. Aucun code ne peut vérifier cela d'ici ; c'est
 * aux constructeurs de requêtes de `queries.ts` de le garantir.
 */
export type RangeReader<T> = (from: number, to: number) => Promise<PageResponse<T>>;

export interface FetchAllOptions {
  /** Lignes demandées par requête. Refusée au-delà de `POSTGREST_MAX_ROWS`. */
  pageSize?: number;
  /** Nombre de lignes au-delà duquel la lecture échoue plutôt que de continuer. */
  hardLimit?: number;
}

/**
 * Lit **toutes** les lignes d'une requête, page après page.
 *
 * Échoue sur la première erreur au lieu de rendre les pages déjà lues : une
 * liste partielle rendue sans erreur est indiscernable d'une liste complète,
 * et c'est précisément le mensonge que ce module existe pour empêcher.
 */
export async function fetchAllRows<T>(
  read: RangeReader<T>,
  options: FetchAllOptions = {},
): Promise<T[]> {
  const pageSize = options.pageSize ?? POSTGREST_MAX_ROWS;
  const hardLimit = options.hardLimit ?? DEFAULT_HARD_LIMIT;

  if (pageSize < 1) {
    throw new Error(`Taille de page invalide : ${pageSize}.`);
  }
  if (pageSize > POSTGREST_MAX_ROWS) {
    // Au-delà du plafond, le serveur rendrait `max_rows` lignes pour une page
    // demandée plus large. La page reviendrait donc « non pleine », la boucle
    // conclurait à la fin des données, et la troncature passerait pour un
    // résultat complet — exactement la panne silencieuse à éviter.
    throw new Error(
      `Taille de page ${pageSize} au-delà du plafond serveur de ${POSTGREST_MAX_ROWS} : ` +
        'la troncature serait prise pour une fin de données.',
    );
  }

  const all: T[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await read(from, from + pageSize - 1);
    if (error !== null) {
      throw new Error(`Lecture paginée interrompue à la ligne ${from} : ${error.message}`);
    }
    const page = data ?? [];
    all.push(...page);

    // Une page incomplète est le seul signal de fin fiable. Une page pleine
    // ne prouve rien : le total peut être un multiple exact de `pageSize`,
    // d'où la requête supplémentaire qui rendra zéro ligne.
    if (page.length < pageSize) return all;

    // On avance du nombre de lignes *reçues* et non de `pageSize` : si le
    // serveur en rendait davantage, avancer de `pageSize` relirait la fin de
    // la page précédente et dupliquerait des lignes.
    from += page.length;

    if (all.length > hardLimit) {
      throw new Error(
        `Lecture paginée arrêtée au-delà de ${hardLimit} lignes : requête trop large ou serveur qui ne termine jamais.`,
      );
    }
  }
}
