import type { WebPresenceCategory } from '@prospeo/core';

/**
 * Un nom de domaine ne se propose qu'à qui n'en a pas déjà un.
 *
 * Ce prédicat gouverne les deux bouts du même invariant, et c'est pour cela
 * qu'il est ici plutôt que recopié : `domains` l'utilise pour choisir à qui
 * proposer, et `score` pour effacer une proposition devenue fausse.
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

/**
 * Durée au-delà de laquelle une vérification de disponibilité cesse de
 * valoir.
 *
 * Un domaine libre en septembre peut être déposé en octobre. Le filtre
 * d'origine — `domain_checked_at is null` — ne rejouait jamais une ligne
 * vérifiée, donc la base gardait à vie un verdict pris une seule fois. Or ce
 * verdict n'est pas une observation figée comme une date de création : c'est
 * un état du registre, qui change sans que rien ne nous prévienne. Affirmer
 * « j'ai vérifié, il est libre » sur un domaine déposé depuis est
 * exactement la valeur fausse que le projet s'interdit — et, dans un message
 * commercial, celle qui se fait démentir en trente secondes.
 *
 * Trente jours : assez long pour que le coût RDAP reste marginal, assez
 * court pour qu'un argument ne parte jamais sur une vérification de
 * plusieurs mois.
 */
export const DOMAIN_FRESHNESS_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Horodatage avant lequel une vérification est considérée périmée.
 *
 * Rendu en ISO parce que c'est sous cette forme qu'il part dans le filtre
 * PostgREST, et calculé ici plutôt que dans le CLI pour que le seuil et sa
 * justification restent au même endroit.
 */
export function domainStaleCutoff(now: Date): string {
  return new Date(now.getTime() - DOMAIN_FRESHNESS_DAYS * DAY_MS).toISOString();
}

/**
 * Vrai si la vérification doit être rejouée.
 *
 * `null` — jamais vérifié — est périmé par construction. Une date
 * illisible l'est aussi : ne pas savoir quand on a vérifié revient à ne pas
 * avoir vérifié, et revérifier coûte une requête RDAP là où s'abstenir
 * coûterait une affirmation invérifiable.
 */
export function isDomainCheckStale(checkedAt: string | null, now: Date): boolean {
  if (checkedAt === null) return true;
  const at = Date.parse(checkedAt);
  if (!Number.isFinite(at)) return true;
  return at < Date.parse(domainStaleCutoff(now));
}

/**
 * Disponibilité d'un nom de domaine — heuristique, et nommée comme telle.
 *
 * L'absence d'enregistrement DNS suggère fortement la disponibilité sans la
 * garantir. RDAP tranche mieux, mais son indisponibilité ne doit jamais se
 * traduire par une affirmation : le champ reste `null`.
 */
export interface DomainDeps {
  resolve: (name: string) => Promise<string[]>;
  rdap: (name: string) => Promise<number>;
}

export async function checkDomainAvailability(
  name: string,
  deps: DomainDeps,
): Promise<boolean | null> {
  try {
    const records = await deps.resolve(name);
    if (records.length > 0) return false; // Résout : donc pris.
  } catch {
    // NXDOMAIN ou panne du résolveur : indiscernables ici, RDAP tranche.
  }

  try {
    const status = await deps.rdap(name);
    if (status === 404) return true;
    if (status === 200) return false;
    return null;
  } catch {
    return null;
  }
}

/** Expiration de l'appel RDAP, alignée sur celle des sondes HTTP. */
const RDAP_TIMEOUT_MS = 10_000;

/**
 * Intervalle minimal entre deux requêtes RDAP. Le registre est public et
 * gratuit : on ne le martèle pas.
 */
export const RDAP_MIN_INTERVAL_MS = 150;

/**
 * Attente restant à observer avant la prochaine requête RDAP.
 *
 * Bornée à l'intervalle lui-même : une horloge qui recule (changement d'heure,
 * synchronisation NTP) donnerait sinon une attente arbitrairement longue et
 * figerait le run.
 */
export function rdapDelayMs(lastCallAt: number, now: number): number {
  const elapsed = now - lastCallAt;
  if (elapsed >= RDAP_MIN_INTERVAL_MS) return 0;
  if (elapsed < 0) return RDAP_MIN_INTERVAL_MS;
  return RDAP_MIN_INTERVAL_MS - elapsed;
}

let lastRdapAt = 0;

/**
 * Statut RDAP du registre `.fr`. Ne renvoie que le code : c'est lui seul qui
 * tranche, et le corps de la réponse ne nous apprendrait rien de plus.
 */
export async function rdapStatus(name: string): Promise<number> {
  const delay = rdapDelayMs(lastRdapAt, Date.now());
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  lastRdapAt = Date.now();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);
  try {
    const response = await fetch(`https://rdap.nic.fr/domain/${encodeURIComponent(name)}`, {
      signal: controller.signal,
      headers: { accept: 'application/rdap+json', 'user-agent': 'ProspeoBot/1.0' },
    });
    return response.status;
  } finally {
    clearTimeout(timer);
  }
}
