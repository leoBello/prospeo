import type { Enums } from '@prospeo/db';
import type { ProspectView } from './prospect.js';

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
