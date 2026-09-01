import { normalizeCompanyName } from './normalize.js';
import type { Trade } from './types.js';

const TLD = 'fr';

/**
 * Noms de domaine plausibles pour une entreprise.
 *
 * L'argumentaire change du tout au tout selon la précision : « j'ai vérifié,
 * plomberie-allard.fr est libre » se répond, « vous devriez prendre un
 * domaine » ne se répond pas.
 */
export function domainCandidates(denomination: string, trade: Trade): string[] {
  const base = normalizeCompanyName(denomination).replace(/ /g, '-');
  if (base === '') return [];

  const metier = normalizeCompanyName(trade.keywords[0] ?? trade.slug).replace(/ /g, '-');
  if (metier !== '' && base.includes(metier)) return [`${base}.${TLD}`];

  return [`${base}.${TLD}`, `${metier}-${base}.${TLD}`, `${base}-${metier}.${TLD}`];
}
