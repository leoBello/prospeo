import { normalizeCompanyName, type ProbeResult } from '@prospeo/core';

const PARKED_MARKERS = [
  'ce domaine est à vendre',
  'domaine à vendre',
  'this domain is for sale',
  'domain for sale',
  'parked domain',
  'site en construction',
  'page en construction',
  'site en cours de construction',
  'site en cours de création',
  'under construction',
  'coming soon',
];

export function hasViewport(html: string): boolean {
  return /<meta[^>]+name\s*=\s*["']?viewport["']?/i.test(html);
}

/**
 * Une page parquée l'annonce dans son titre ou tout en haut du document.
 * On ne cherche donc pas dans la page entière : « nous intervenons sur les
 * chantiers en construction » est une phrase banale chez un plombier, et la
 * chercher partout classerait une entreprise bien vivante comme site mort.
 */
export function detectParked(html: string): boolean {
  const lower = html.toLowerCase();
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(lower)?.[1] ?? '';
  const haystack = `${title} ${lower.slice(0, 3000)}`;
  return PARKED_MARKERS.some((marker) => haystack.includes(marker));
}

export interface FetchedPage {
  status: number;
  finalUrl: string;
  body: string;
}

async function defaultFetch(url: string): Promise<FetchedPage> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; ProspeoBot/1.0)' },
    });
    const body = await response.text();
    // `response.url` porte la destination réelle APRÈS redirections, ce que
    // l'URL demandée ne dit pas. Un site qui redirige http vers https est sain ;
    // renvoyer l'URL demandée le ferait passer pour un site sans HTTPS.
    return {
      status: response.status,
      finalUrl: response.url === '' ? url : response.url,
      body: body.slice(0, 200_000),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Ne lève jamais : une URL injoignable est un résultat, pas une erreur. */
export async function probeUrl(
  url: string,
  fetchImpl: (url: string) => Promise<FetchedPage> = defaultFetch,
): Promise<ProbeResult> {
  try {
    const page = await fetchImpl(url);
    return {
      url,
      reachable: true,
      httpStatus: page.status,
      isHttps: page.finalUrl.startsWith('https://'),
      finalUrl: page.finalUrl,
      hasViewportMeta: hasViewport(page.body),
      isParked: detectParked(page.body),
    };
  } catch {
    return {
      url,
      reachable: false,
      httpStatus: null,
      isHttps: url.startsWith('https://'),
      finalUrl: null,
      hasViewportMeta: false,
      isParked: false,
    };
  }
}

/**
 * Variantes de nom de domaine à tester. Heuristique assumée : l'absence
 * d'enregistrement DNS suggère fortement la disponibilité sans la garantir.
 */
export function domainCandidates(denomination: string): string[] {
  const words = normalizeCompanyName(denomination).split(' ').filter((w) => w.length > 1);
  if (words.length === 0) return [];
  if (words.length === 1) return [`${words[0]}.fr`];

  const [first, second] = words as [string, string];
  return [`${first}-${second}.fr`, `${first}${second}.fr`, `${second}-${first}.fr`];
}

/** Fenêtre au-delà de laquelle une sonde est considérée périmée. */
export const PROBE_FRESHNESS_DAYS = 7;

/**
 * Resonder est voulu — un site meurt entre deux runs, c'est précisément ce
 * qu'on cherche. Mais tout resonder à chaque passage retéléchargerait une
 * centaine de sites pour reconstater l'évidence dès que `enrich` aura rempli
 * `declared_url`.
 *
 * Un horodatage illisible fait sonder : supposer une sonde fraîche sur une
 * donnée qu'on ne sait pas lire reviendrait à inventer une observation.
 */
export function shouldProbe(probedAt: string | null, now: Date, force: boolean): boolean {
  if (force || probedAt === null) return true;
  const previous = new Date(probedAt).getTime();
  if (Number.isNaN(previous)) return true;
  const ageDays = (now.getTime() - previous) / 86_400_000;
  return ageDays >= PROBE_FRESHNESS_DAYS;
}
