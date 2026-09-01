import { request } from 'undici';
import { normalizeCompanyName, type ProbeResult } from '@prospeo/core';

const PARKED_MARKERS = [
  'domaine est à vendre', 'domain is for sale', 'this domain',
  'en construction', 'under construction', 'coming soon',
  'parked domain', 'site en cours de création',
];

export function hasViewport(html: string): boolean {
  return /<meta[^>]+name\s*=\s*["']?viewport["']?/i.test(html);
}

export function detectParked(html: string): boolean {
  const text = html.toLowerCase();
  return PARKED_MARKERS.some((marker) => text.includes(marker));
}

export interface FetchedPage {
  status: number;
  finalUrl: string;
  body: string;
}

async function defaultFetch(url: string): Promise<FetchedPage> {
  const response = await request(url, {
    method: 'GET',
    maxRedirections: 5,
    headersTimeout: 10_000,
    bodyTimeout: 10_000,
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; ProspeoBot/1.0)' },
  });
  const body = await response.body.text();
  return { status: response.statusCode, finalUrl: url, body: body.slice(0, 200_000) };
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
