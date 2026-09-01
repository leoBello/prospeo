import { describe, expect, it } from 'vitest';
import {
  parseLatLngFromUrl,
  parseRating,
  parseReviewCount,
  toMapsCandidate,
  type RawMapsPlace,
} from './google-maps-normalize.js';

describe('parseRating', () => {
  it('lit une note à virgule décimale française', () => {
    expect(parseRating('4,7')).toBe(4.7);
  });

  it('lit une note à point décimal', () => {
    expect(parseRating('4.7')).toBe(4.7);
  });

  it('rejette une valeur hors de l échelle plutôt que de la tronquer', () => {
    expect(parseRating('47')).toBeNull();
  });

  it('rejette une note négative au lieu de la tronquer', () => {
    expect(parseRating('-1')).toBeNull();
  });

  it('rend null sur une entrée vide ou illisible', () => {
    expect(parseRating(null)).toBeNull();
    expect(parseRating('')).toBeNull();
    expect(parseRating('Aucun avis')).toBeNull();
  });
});

describe('parseReviewCount', () => {
  it('lit un nombre entre parenthèses', () => {
    expect(parseReviewCount('(31)')).toBe(31);
  });

  it('absorbe les séparateurs de milliers, espace insécable comprise', () => {
    expect(parseReviewCount('(1 128)')).toBe(1128);
    expect(parseReviewCount('(1\u00a0128)')).toBe(1128);
  });

  it('lit un libellé complet', () => {
    expect(parseReviewCount('128 avis')).toBe(128);
  });

  it('rend null sans chiffre', () => {
    expect(parseReviewCount(null)).toBeNull();
    expect(parseReviewCount('Aucun avis')).toBeNull();
  });

  // La virgule est une marque décimale en français, pas un séparateur de
  // milliers : quand une note et un nombre d'avis se côtoient dans la même
  // chaîne, seul le contenu des parenthèses (ou, à défaut, le groupe de
  // chiffres en tête de chaîne) désigne le nombre d'avis. Les confondre
  // produirait une valeur plausible mais fausse sur un champ qui alimente
  // le barème de qualification.
  it('ignore la note qui précède les parenthèses', () => {
    expect(parseReviewCount('4,7 (128)')).toBe(128);
  });

  it('lit le groupe de chiffres en tête même suivi de la note', () => {
    expect(parseReviewCount('128 avis · 4,7')).toBe(128);
  });

  it('rejette une note isolée plutôt que de la lire comme un nombre d avis', () => {
    expect(parseReviewCount('4,7')).toBeNull();
  });
});

describe('parseLatLngFromUrl', () => {
  it('lit les coordonnées de la forme @lat,lng,zoom', () => {
    expect(parseLatLngFromUrl('https://www.google.com/maps/place/X/@47.2213,-1.5601,17z/data=!x')).toEqual(
      { latitude: 47.2213, longitude: -1.5601 },
    );
  });

  it('lit les coordonnées de la forme !3dlat!4dlng', () => {
    expect(parseLatLngFromUrl('https://www.google.com/maps/place/X/data=!3d47.2213!4d-1.5601')).toEqual(
      { latitude: 47.2213, longitude: -1.5601 },
    );
  });

  it('rend null sans coordonnées', () => {
    expect(parseLatLngFromUrl('https://www.google.com/maps')).toBeNull();
  });

  it('rejette des coordonnées hors des bornes terrestres', () => {
    expect(parseLatLngFromUrl('https://www.google.com/maps/@200,-1.5601,17z/')).toBeNull();
  });

  it('préfère la forme !3d!4d à la forme @lat,lng quand les deux sont présentes', () => {
    expect(
      parseLatLngFromUrl(
        'https://www.google.com/maps/place/X/@47.0,-1.0,17z/data=!3d47.2213!4d-1.5601',
      ),
    ).toEqual({ latitude: 47.2213, longitude: -1.5601 });
  });
});

describe('toMapsCandidate', () => {
  const raw: RawMapsPlace = {
    name: 'Allard Plomberie',
    address: '11 rue Auguste Brizeux, 44000 Nantes',
    category: 'Plombier',
    phone: '02 40 00 00 00',
    website: 'https://allard-plomberie.fr',
    ratingText: '4,6',
    reviewCountText: '(31)',
    placeUrl: 'https://www.google.com/maps/place/Allard/@47.2214,-1.5602,17z/',
  };

  it('convertit une fiche complète', () => {
    expect(toMapsCandidate(raw)).toEqual({
      name: 'Allard Plomberie',
      address: '11 rue Auguste Brizeux, 44000 Nantes',
      latitude: 47.2214,
      longitude: -1.5602,
      category: 'Plombier',
      phone: '02 40 00 00 00',
      website: 'https://allard-plomberie.fr',
      rating: 4.6,
      reviewCount: 31,
      placeId: null,
      mapsUrl: raw.placeUrl,
    });
  });

  it('rejette une fiche sans nom : elle n est appariable par rien', () => {
    expect(toMapsCandidate({ ...raw, name: '   ' })).toBeNull();
  });

  it('accepte une fiche sans coordonnées, la distance restera inconnue', () => {
    const candidate = toMapsCandidate({ ...raw, placeUrl: 'https://www.google.com/maps' });
    expect(candidate?.latitude).toBeNull();
    expect(candidate?.mapsUrl).toBe('https://www.google.com/maps');
  });

  it('découpe le place_id quand l URL le porte', () => {
    const candidate = toMapsCandidate({
      ...raw,
      placeUrl: 'https://www.google.com/maps/place/X/@47.2,-1.5,17z/data=!19sChIJabc123',
    });
    expect(candidate?.placeId).toBe('ChIJabc123');
  });
});
