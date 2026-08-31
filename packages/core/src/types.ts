export interface Trade {
  slug: string;
  label: string;
  /** Codes NAF au format API, avec point : '43.22A'. */
  nafCodes: string[];
  /** Requêtes utilisées par l'enrichissement Google Maps (plan n°2). */
  mapsQueries: string[];
  /** Mots-clés de cohérence métier, utilisés à l'appariement. */
  keywords: string[];
}

export interface RawEstablishment {
  siret: string;
  siren: string;
  tradeSlug: string;
  denomination: string;
  denominationUsuelle: string | null;
  nafCode: string | null;
  address: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  /** Date ISO `YYYY-MM-DD`. */
  dateCreation: string | null;
  /** Code de tranche d'effectif INSEE, ex. '02', 'NN'. */
  effectifCode: string | null;
  isEntrepreneurIndividuel: boolean;
  isHeadOffice: boolean;
}

export type WebPresenceCategory =
  | 'none'
  | 'social_only'
  | 'directory_only'
  | 'dead_site'
  | 'has_site';

export interface ProbeResult {
  url: string;
  reachable: boolean;
  httpStatus: number | null;
  isHttps: boolean;
  finalUrl: string | null;
  hasViewportMeta: boolean;
  isParked: boolean;
}

export interface ClassifyInput {
  /** URL déclarée sur la fiche Google Maps, si connue. */
  declaredUrl: string | null;
  /** URLs de réseaux sociaux découvertes par ailleurs. */
  socialUrls: string[];
  /** Résultat de sonde ; `null` si l'URL déclarée n'a pas encore été sondée. */
  probe: ProbeResult | null;
}

export type PhoneKind = 'mobile' | 'landline';

export interface NormalizedPhone {
  e164: string;
  kind: PhoneKind;
}

export interface ScoreInput {
  category: WebPresenceCategory;
  rating: number | null;
  reviewCount: number | null;
  /** Date ISO du dernier contenu social public, si lisible. */
  lastSocialPostAt: string | null;
  effectifCode: string | null;
  dateCreation: string | null;
  phoneKind: PhoneKind | null;
  isClosed: boolean;
  isFranchise: boolean;
}

export interface ScoreLine {
  code: string;
  label: string;
  points: number;
  group: 'presence' | 'vitalite' | 'joignabilite' | 'disqualifiant';
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreLine[];
  rulesetVersion: string;
}
