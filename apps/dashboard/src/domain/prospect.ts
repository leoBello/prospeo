import type { Enums } from '@prospeo/db';
import type { PhoneKind, ScoreLine, WebPresenceCategory } from '@prospeo/core';
import type { TranslationKey, TranslationParams } from '../i18n/translate.js';

/**
 * Vue d'un prospect telle que l'interface la consomme.
 *
 * Les quatre satellites sont `null` quand la ligne n'existe pas en base, et
 * ce `null` est porteur de sens : au 1ᵉʳ septembre 2026, 114 prospects sur 139
 * n'ont ni enrichissement, ni présence web, ni score. Aucun code de cette
 * couche ne doit remplacer un satellite absent par un objet vide ou par des
 * zéros — un prospect non scoré n'est pas un prospect à zéro, et la
 * distinction remonte jusqu'à l'écran.
 */
export interface ProspectView {
  id: string;
  siret: string;
  denomination: string;
  denominationUsuelle: string | null;
  tradeSlug: string;
  address: string;
  postalCode: string;
  city: string;
  dateCreation: string | null;
  effectifCode: string | null;
  isClosed: boolean;
  discoveredAt: string;
  score: ScoreView | null;
  presence: PresenceView | null;
  enrichment: EnrichmentView | null;
  pipeline: PipelineView | null;
}

export interface ScoreView {
  total: number;
  rulesetVersion: string;
  computedAt: string;
  breakdown: ScoreLine[];
}

export interface PresenceView {
  /**
   * `null` à dessein : `probe` s'exécute avant `classify` et ne connaît pas
   * encore la catégorie. Une ligne sondée mais non classée est un état réel,
   * distinct de l'absence de ligne.
   */
  category: WebPresenceCategory | null;
  finalUrl: string | null;
  httpStatus: number | null;
  /** Heuristique DNS/RDAP : suggère la disponibilité, ne la garantit pas. */
  domainAvailable: boolean | null;
  probedAt: string | null;
}

export interface EnrichmentView {
  status: Enums<'enrichment_status'>;
  phoneE164: string | null;
  phoneKind: PhoneKind | null;
  rating: number | null;
  /** Plus publié par Google depuis août 2026 : `null` ne veut pas dire zéro avis. */
  reviewCount: number | null;
  declaredUrl: string | null;
  matchedName: string | null;
  matchConfidence: number | null;
  enrichedAt: string;
}

export interface PipelineView {
  status: Enums<'pipeline_status'>;
  nextActionAt: string | null;
  updatedAt: string;
}

/**
 * Un fragment de la raison affichée en bout de ligne.
 *
 * Deux natures, et la distinction n'est pas cosmétique. `key` désigne une
 * chaîne d'interface, traduite ; `raw` porte un libellé venu de la base —
 * ceux du `breakdown`, écrits en français par le barème du collector. Ces
 * derniers sont des données au même titre que les messages de prospection
 * (§9.5) : les traduire supposerait de réimplémenter ici la fabrication des
 * libellés du barème, qui dériverait à la première évolution des règles.
 */
export type ReasonFragment =
  | { kind: 'key'; key: TranslationKey; params?: TranslationParams }
  | { kind: 'raw'; text: string };

/** Une ligne de liste de travail : le prospect, et pourquoi il est là. */
export interface WorkRow {
  prospect: ProspectView;
  reason: ReasonFragment[];
}

/**
 * Une liste de travail, avec le nombre réel de lignes qui la composent.
 *
 * `totalCount` n'est pas `items.length` : les listes sont plafonnées à
 * l'affichage, et annoncer le nombre affiché cacherait cent prospects
 * derrière un titre rassurant.
 */
export interface WorkList {
  items: WorkRow[];
  totalCount: number;
}
