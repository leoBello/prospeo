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
    // « depannage » qualifie exactement autant un plombier qu'un serrurier,
    // et il figurait pourtant dans les seuls mots-clés du second. Mesuré sur
    // le lot de calibration : « OUEST DEPANNAGE PLOMBERIE » obtenait 1,00
    // face à « AMS Services - Spécialiste en Dépannage Plomberie… » sur ce
    // seul mot. Il reste en QUEUE de liste : `keywords[0]` compose les noms
    // de domaine proposés, où l'on veut « plomberie ».
    keywords: ['plomberie', 'plombier', 'chauffagiste', 'sanitaire', 'chauffage', 'depannage'],
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
