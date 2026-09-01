import { nameVariants } from './name-match.js';
import { normalizeCompanyName } from './normalize.js';
import type { Trade, WebPresenceCategory } from './types.js';

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

/**
 * Un nom de domaine ne se propose qu'à qui n'en a pas déjà un.
 *
 * Ce prédicat gouverne les deux bouts du même invariant, et c'est pour cela
 * qu'il est ici plutôt que recopié : `domains` l'utilise pour choisir à qui
 * proposer, `score` pour effacer une proposition devenue fausse, et
 * `assemblePitchFacts` pour refuser de la citer dans un message.
 *
 * Sans le second usage, un état contradictoire restait atteignable et
 * durable. `domains` proposait « plomberie-allard.fr est libre » à un
 * prospect classé `none` ; une sonde ultérieure découvrait son site et le
 * reclassait `has_site` ; la proposition, elle, ne bougeait plus. La même
 * ligne affirmait alors à la fois que l'artisan a un site et qu'un domaine
 * l'attend — et c'est la seconde moitié qui partait dans le message.
 */
export function domainProposalApplies(category: WebPresenceCategory | null): boolean {
  return DOMAIN_PROPOSAL_CATEGORIES.includes(category as WebPresenceCategory);
}

/**
 * Les catégories concernées, sous la forme que le filtre SQL attend.
 *
 * Le prédicat en dérive plutôt que de la recopier : le filtre de lecture de
 * `domains` et l'effacement de `score` doivent bouger ensemble, faute de quoi
 * une catégorie ajoutée d'un côté laisserait l'autre écrire ou conserver une
 * proposition qu'il ne devrait pas.
 *
 * `dead_site` en est écarté comme `has_site` : un site mort a un domaine,
 * déjà déposé par son propriétaire. Le sujet y est de le raviver, pas d'en
 * enregistrer un second.
 */
export const DOMAIN_PROPOSAL_CATEGORIES: readonly WebPresenceCategory[] = [
  'none',
  'social_only',
  'directory_only',
];
