import type { Trade } from './types.js';

/**
 * Ajouter un métier consiste à ajouter un objet ici.
 *
 * `nafCodes` est volontairement un tableau : la nomenclature NAF est en cours
 * de révision et l'API expose aussi un champ `activite_principale_naf25`.
 * Un code unique ferait disparaître silencieusement une part de la population.
 */
export const TRADES: readonly Trade[] = [
  {
    slug: 'plombier',
    label: 'Plombier',
    nafCodes: ['43.22A'],
    mapsQueries: ['plombier', 'plomberie'],
    keywords: ['plomberie', 'plombier', 'chauffagiste', 'sanitaire', 'chauffage'],
    categoryLabels: ['plombier', 'plomberie', 'chauffagiste'],
  },
  {
    slug: 'serrurier',
    label: 'Serrurier',
    nafCodes: ['43.32B'],
    mapsQueries: ['serrurier', 'serrurerie'],
    keywords: ['serrurerie', 'serrurier', 'blindage', 'metallerie', 'depannage'],
    categoryLabels: ['serrurier', 'serrurerie', 'metallerie'],
  },
];

export function getTrade(slug: string): Trade | undefined {
  return TRADES.find((trade) => trade.slug === slug);
}
