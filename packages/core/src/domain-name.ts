import { nameVariants } from './name-match.js';
import { normalizeCompanyName } from './normalize.js';
import type { Trade } from './types.js';

const TLD = 'fr';

/** Au-delà, un nom de domaine cesse d'être une proposition sérieuse. */
const MAX_LABEL_LENGTH = 30;

/**
 * Noms de domaine plausibles pour une entreprise.
 *
 * L'argumentaire change du tout au tout selon la précision : « j'ai vérifié,
 * plomberie-allard.fr est libre » se répond, « vous devriez prendre un
 * domaine » ne se répond pas.
 *
 * D'où le passage par `nameVariants` plutôt que par la raison sociale brute.
 * Sirene enregistre chez un entrepreneur individuel un état civil accolé à
 * son enseigne — un cinquième de la population, cf. §5.1 du spec — et la
 * dérivation directe produisait alors des noms que personne ne prendrait :
 *
 *     "PHILIPPE DELAITRE (POPO LES BONS TUYAUX / PHILIPPE DELAITRE)"
 *       -> philippe-delaitre-popo-les-bons-tuyaux-philippe-delaitre.fr
 *
 * Ces noms-là sont évidemment libres, et c'est précisément ce qui les rend
 * sans valeur : proposer un domaine que personne ne veut n'est pas un
 * argument. On retient donc la variante la plus courte — celle qui approche
 * le nom commercial — et on écarte ce qui reste trop long pour être proposé.
 */
export function domainCandidates(
  denomination: string,
  denominationUsuelle: string | null,
  trade: Trade,
): string[] {
  const usable = (source: string, usuelle: string | null): string[] =>
    nameVariants(source, usuelle)
      .map((variant) => variant.replace(/ /g, '-'))
      .filter((variant) => variant !== '' && variant.length <= MAX_LABEL_LENGTH)
      .sort((a, b) => a.length - b.length);

  // L'enseigne prime sur l'état civil quand elle existe : c'est le nom sous
  // lequel l'artisan se présente, et donc celui qu'il voudra en domaine.
  // « Ouest Dépannage Plomberie » vaut mieux que « Christophe Jinjolet », même
  // si le second est plus court.
  const variants =
    denominationUsuelle === null ? [] : usable(denominationUsuelle, denominationUsuelle);
  const base = variants[0] ?? usable(denomination, denominationUsuelle)[0];
  if (base === undefined) return [];

  const metier = normalizeCompanyName(trade.keywords[0] ?? trade.slug).replace(/ /g, '-');
  if (metier !== '' && base.includes(metier)) return [`${base}.${TLD}`];

  return [`${base}.${TLD}`, `${metier}-${base}.${TLD}`, `${base}-${metier}.${TLD}`];
}
