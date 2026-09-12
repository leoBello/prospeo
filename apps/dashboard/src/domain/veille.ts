import type { Enums } from '@prospeo/db';
import type { ProspectView, ScoreView } from './prospect.js';

/** Un onglet de la veille : les sept statuts du pipeline, plus la vue d'ensemble. */
export type OngletVeille = Enums<'pipeline_status'> | 'toutes';

/**
 * L'ordre de la barre d'onglets, qui est celui du parcours réel d'un
 * prospect — puis « toutes », séparée d'un trait.
 *
 * Les sept premiers sont écrits ici plutôt que dérivés de l'énumération de la
 * base : `Enums<'pipeline_status'>` ne porte aucun ordre, et celui de la
 * migration n'est pas celui du parcours.
 */
export const ONGLETS: readonly OngletVeille[] = [
  'a_contacter',
  'contacte',
  'relance',
  'interesse',
  'gagne',
  'perdu',
  'ne_pas_contacter',
  'toutes',
];

/**
 * Dans quel onglet ce prospect se range.
 *
 * **Décision 1A du 2026-09-10.** Un prospect sans ligne de suivi va dans
 * « à contacter » : ils sont 137 sur 139 au 2 septembre 2026, et les laisser
 * hors de tout onglet retirerait 98 % de la base de l'écran. Ce n'est PAS une
 * confusion des deux absences — « jamais contacté » (aucune ligne) reste
 * distinct de « à contacter » (une ligne posée) partout où la ligne s'affiche,
 * parce que `pipeline` continue de valoir `null` et que `StatusBadge` le
 * nomme. Ce que cette fonction décide, c'est où chercher, pas ce qu'on lit.
 */
export function ongletDe(prospect: ProspectView): Enums<'pipeline_status'> {
  return prospect.pipeline?.status ?? 'a_contacter';
}

/**
 * Le nombre de lignes d'une page. **Une constante, et elle le reste.**
 *
 * Décision 3-1 du 2026-09-10 : aucun code ne mesure la hauteur disponible pour
 * en déduire une taille de page. Le projet voisin l'a essayé puis abandonné le
 * même jour, sur écran réel — la hauteur mesurée tombait à zéro sur un
 * portable, et la liste n'affichait plus AUCUNE ligne. Ce qui s'ajuste à la
 * fenêtre, c'est le repli du brief.
 */
export const LIGNES_PAR_PAGE = 10;

/** L'ordre du classement. Deux valeurs : la table se lit par score, dans un sens ou l'autre. */
export type OrdreVeille = 'score_desc' | 'score_asc';

export interface ComptesVeille {
  /** Un compte par onglet, y compris ceux à zéro : un onglet vide reste une étape du parcours. */
  parOnglet: Record<OngletVeille, number>;
  /**
   * Les prospects sans aucune ligne de suivi en base, **scorés ou non**.
   *
   * Distinct de `parOnglet.a_contacter`, qui ne compte que les classables :
   * la ligne de compte de l'écran dit « N classables, sur M sans aucune ligne
   * de suivi », et M ne se déduit d'aucun compte d'onglet.
   */
  sansSuivi: number;
  /**
   * Les prospects jamais scorés, qui ne figurent dans aucun onglet.
   *
   * Ils ne sont pas classables — un score manquant n'est pas un score nul — et
   * la ligne de compte de l'écran les nomme. Les exclure en silence les
   * ferait disparaître de la base aux yeux de l'opérateur.
   */
  sansScore: number;
}

/** Un prospect scoré : un score qui n'est jamais lu comme un zéro. */
type ProspectClassable = ProspectView & { score: ScoreView };

/**
 * Un prospect entre-t-il au classement ? Non sans score : il n'a pas de rang.
 *
 * En garde de type plutôt qu'en simple booléen : le `.filter` de `pageVeille`
 * en tire un tableau où `score` est garanti présent, et le tri qui suit n'a
 * plus besoin d'un `?? 0` — un score absent n'y est jamais lu comme un zéro.
 */
function classable(prospect: ProspectView): prospect is ProspectClassable {
  return prospect.score !== null;
}

export function comptesVeille(prospects: ProspectView[]): ComptesVeille {
  const parOnglet = Object.fromEntries(ONGLETS.map((o) => [o, 0])) as Record<OngletVeille, number>;
  let sansScore = 0;
  let sansSuivi = 0;

  for (const prospect of prospects) {
    // Compté AVANT la garde du score : un prospect sans ligne de suivi l'est
    // qu'il ait un score ou non, et c'est ce nombre-là que l'écran annonce.
    if (prospect.pipeline === null) sansSuivi += 1;

    if (!classable(prospect)) {
      sansScore += 1;
      continue;
    }
    parOnglet[ongletDe(prospect)] += 1;
    parOnglet.toutes += 1;
  }

  return { parOnglet, sansScore, sansSuivi };
}

export interface PageVeille {
  lignes: ProspectView[];
  /** Le nombre de lignes de l'onglet, pas celui de la page. */
  total: number;
  /** La page réellement rendue, qui peut différer de celle demandée (bornage). */
  page: number;
  /** Toujours au moins 1 : une table vide a une page, pas zéro. */
  pages: number;
  /** Rang de la première et de la dernière ligne affichées, à partir de 1 ; `0` si vide. */
  premier: number;
  dernier: number;
}

/**
 * La page à afficher : le filtre de l'onglet, le classement, la découpe.
 *
 * Le départage par dénomination n'est pas un raffinement : sans lui, deux
 * prospects de même score peuvent changer de place entre deux appels, et la
 * pagination montrerait alors l'un deux fois et l'autre jamais — avec le bon
 * nombre de lignes, donc sans que rien ne le signale.
 */
export function pageVeille(
  prospects: ProspectView[],
  onglet: OngletVeille,
  ordre: OrdreVeille,
  page: number,
): PageVeille {
  const retenus = prospects
    // `classable` en garde de type d'abord : le tableau qui en sort a `score`
    // garanti présent, et le tri ci-dessous n'a plus à choisir entre lire ou
    // inventer un score absent.
    .filter(classable)
    .filter((p) => onglet === 'toutes' || ongletDe(p) === onglet)
    .sort((a, b) => {
      const ecart = b.score.total - a.score.total;
      const parScore = ordre === 'score_asc' ? -ecart : ecart;
      return parScore !== 0 ? parScore : a.denomination.localeCompare(b.denomination, 'fr');
    });

  const total = retenus.length;
  const pages = Math.max(1, Math.ceil(total / LIGNES_PAR_PAGE));
  const courante = Math.min(Math.max(1, Math.trunc(page)), pages);
  const debut = (courante - 1) * LIGNES_PAR_PAGE;
  const lignes = retenus.slice(debut, debut + LIGNES_PAR_PAGE);

  return {
    lignes,
    total,
    page: courante,
    pages,
    premier: lignes.length === 0 ? 0 : debut + 1,
    dernier: lignes.length === 0 ? 0 : debut + lignes.length,
  };
}
