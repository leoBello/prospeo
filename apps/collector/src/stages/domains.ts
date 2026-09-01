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
