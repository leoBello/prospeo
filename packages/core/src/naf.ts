import type { Trade } from './types.js';

/** Retire le point : `43.22A` et `4322A` désignent la même activité. */
function canonical(code: string): string {
  return code.replace(/\./g, '').toUpperCase();
}

/**
 * Le NAF de l'établissement correspond-il au métier visé ?
 *
 * L'API filtre l'activité au niveau de l'ENTREPRISE et le code postal au
 * niveau de l'ÉTABLISSEMENT : un établissement retenu ne porte donc pas
 * nécessairement le métier cherché. Mesuré à 4 % sur le premier lot.
 *
 * On signale sans écarter : l'entreprise est bien du métier, l'établissement
 * peut exercer les deux activités ou porter un code périmé. `null` dit
 * « inconnu », qui n'est pas « divergent ».
 */
export function nafMatchesTrade(nafCode: string | null, trade: Trade): boolean | null {
  if (nafCode === null || nafCode.trim() === '') return null;
  const target = canonical(nafCode);
  return trade.nafCodes.some((code) => canonical(code) === target);
}
