import type { ClassifyInput, ProbeResult, WebPresenceCategory } from './types.js';

const SOCIAL_DOMAINS = [
  'facebook.com', 'fb.com', 'fb.me', 'm.facebook.com',
  'instagram.com', 'linkedin.com', 'tiktok.com',
];

const DIRECTORY_DOMAINS = [
  'pagesjaunes.fr', 'yelp.com', 'yelp.fr', 'business.site',
  'wixsite.com', 'pages.jaunes.fr', 'solocal.com',
  'houzz.fr', 'starofservice.com', 'travaux.com',
];

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

function matchesDomain(host: string, list: string[]): boolean {
  return list.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

/** Un site est sain s'il est joignable, en HTTPS, responsive et non parqué. */
export function isHealthySite(probe: ProbeResult): boolean {
  if (!probe.reachable) return false;
  if (probe.httpStatus === null || probe.httpStatus < 200 || probe.httpStatus >= 400) return false;
  if (!probe.isHttps) return false;
  if (probe.isParked) return false;
  if (!probe.hasViewportMeta) return false;
  return true;
}

/**
 * Renvoie `null` lorsque la catégorie n'est pas encore déterminable :
 * un domaine propre est déclaré mais n'a pas été sondé. L'appelant doit
 * alors lancer l'étage `probe` avant de reclasser.
 */
export function classifyWebPresence(input: ClassifyInput): WebPresenceCategory | null {
  const { declaredUrl, socialUrls, probe } = input;

  if (declaredUrl === null) {
    return socialUrls.length > 0 ? 'social_only' : 'none';
  }

  const host = hostOf(declaredUrl);
  if (host !== null) {
    if (matchesDomain(host, SOCIAL_DOMAINS)) return 'social_only';
    if (matchesDomain(host, DIRECTORY_DOMAINS)) return 'directory_only';
  }

  if (probe === null) return null;
  return isHealthySite(probe) ? 'has_site' : 'dead_site';
}
