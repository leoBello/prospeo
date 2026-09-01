import type { MapsCandidate } from '@prospeo/core';

/**
 * Ce que le navigateur extrait d'une fiche : rien que des chaînes.
 *
 * Le contrat est volontairement plat et textuel. Tout le reste — virgule
 * décimale, séparateurs de milliers, coordonnées noyées dans l'URL — est
 * converti ici, où c'est testable sans navigateur.
 */
export interface RawMapsPlace {
  name: string | null;
  address: string | null;
  category: string | null;
  phone: string | null;
  website: string | null;
  ratingText: string | null;
  reviewCountText: string | null;
  placeUrl: string;
}

/** Note Google, de 0 à 5, virgule décimale française admise. */
export function parseRating(text: string | null): number | null {
  if (text === null) return null;
  // Le signe est capture : sans lui, « -1 » rendrait 1 au lieu d'etre rejete,
  // c'est-a-dire qu'une valeur hors echelle serait silencieusement tronquee
  // en une note plausible.
  const found = text.replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (found === null) return null;
  const value = Number(found[0]);
  // Hors échelle : mieux vaut ne rien savoir qu'affirmer une note fausse.
  if (!Number.isFinite(value) || value < 0 || value > 5) return null;
  return value;
}

/** Nombre d'avis, parenthèses et séparateurs de milliers absorbés. */
export function parseReviewCount(text: string | null): number | null {
  if (text === null) return null;
  // `\s` couvre déjà l'espace insécable (U+00A0) et l'espace fine
  // insécable (U+202F) que Google utilise comme séparateurs de milliers ;
  // on les liste aussi explicitement, en séquences d'échappement littérales,
  // pour ne rien laisser dépendre d'un caractère invisible dans ce fichier.
  const digits = text.replace(/[\s\u00a0\u202f.,]/g, '').match(/\d+/);
  if (digits === null) return null;
  const value = Number(digits[0]);
  return Number.isSafeInteger(value) ? value : null;
}

/** Coordonnées d'une URL de fiche, sous l'une ou l'autre de ses deux formes. */
export function parseLatLngFromUrl(
  url: string,
): { latitude: number; longitude: number } | null {
  const at = url.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const data = url.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  // `!3d!4d` désigne le lieu lui-même ; `@lat,lng` le centre de la vue
  // cartographique, qui peut en différer de plusieurs centaines de mètres.
  // On préfère donc `!3d!4d` quand les deux formes sont présentes.
  const found = data ?? at;
  if (found === null) return null;

  const latText = found[1];
  const lngText = found[2];
  if (latText === undefined || lngText === undefined) return null;

  const latitude = Number(latText);
  const longitude = Number(lngText);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // Hors bornes terrestres : l'URL ne portait pas ce qu'on croyait y lire.
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

/** Identifiant de lieu, quand l'URL le porte. */
function parsePlaceId(url: string): string | null {
  const found = url.match(/!19s([\w-]+)/) ?? url.match(/[?&]cid=(\d+)/);
  return found?.[1] ?? null;
}

function trimmed(value: string | null): string | null {
  if (value === null) return null;
  const clean = value.trim();
  return clean === '' ? null : clean;
}

/**
 * `null` quand la fiche n'a pas de nom : sans nom elle n'est appariable par
 * rien, et la retenir ne ferait qu'introduire du bruit dans la file ambiguë.
 */
export function toMapsCandidate(raw: RawMapsPlace): MapsCandidate | null {
  const name = trimmed(raw.name);
  if (name === null) return null;

  const coords = parseLatLngFromUrl(raw.placeUrl);

  return {
    name,
    address: trimmed(raw.address),
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    category: trimmed(raw.category),
    phone: trimmed(raw.phone),
    website: trimmed(raw.website),
    rating: parseRating(raw.ratingText),
    reviewCount: parseReviewCount(raw.reviewCountText),
    placeId: parsePlaceId(raw.placeUrl),
    mapsUrl: raw.placeUrl,
  };
}
