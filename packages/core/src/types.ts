export interface Trade {
  slug: string;
  label: string;
  /** Codes NAF au format API, avec point : '43.22A'. */
  readonly nafCodes: readonly string[];
  /** Requêtes utilisées par l'enrichissement Google Maps (plan n°2). */
  readonly mapsQueries: readonly string[];
  /** Mots-clés de cohérence métier, utilisés à l'appariement. */
  readonly keywords: readonly string[];
  /**
   * Libellés de catégorie Google Maps qui valent confirmation du métier.
   *
   * Délibérément plus étroit que `keywords` : `keywords` sert au retrait des
   * jetons génériques d'un nom d'entreprise et à la construction des
   * requêtes, un usage où la largeur est un atout — mieux vaut retirer un mot
   * de trop que laisser un jeton de métier polluer la comparaison de noms.
   * Une catégorie Google, elle, doit au contraire *distinguer* le métier des
   * métiers voisins : un mot comme « dépannage », utile pour retirer des
   * jetons, qualifie aussi bien l'électroménager, l'informatique ou
   * l'automobile, et confirmerait à tort n'importe quelle fiche « Dépannage »
   * comme un serrurier.
   */
  readonly categoryLabels: readonly string[];
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

/**
 * Alias de type et non `interface` : une interface n'a pas de signature d'index
 * implicite, donc `ScoreLine[]` ne serait pas assignable au type `Json` de la
 * colonne `jsonb` qui la stocke. Le comportement est identique pour les
 * consommateurs, seule la compatibilite structurelle change.
 */
export type ScoreLine = {
  code: string;
  label: string;
  points: number;
  group: 'presence' | 'vitalite' | 'joignabilite' | 'disqualifiant';
};

export interface ScoreResult {
  total: number;
  breakdown: ScoreLine[];
  rulesetVersion: string;
}
