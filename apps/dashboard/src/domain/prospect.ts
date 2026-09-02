import type { Enums } from '@prospeo/db';
import type { PhoneKind, ScoreLine, WebPresenceCategory } from '@prospeo/core';
import type { TranslationKey, TranslationParams } from '../i18n/translate.js';

/**
 * Vue d'un prospect telle que l'interface la consomme.
 *
 * Les quatre satellites sont `null` quand la ligne n'existe pas en base, et
 * ce `null` est porteur de sens. Au 1ᵉʳ septembre 2026, 114 prospects sur 139
 * n'avaient ni enrichissement, ni présence web, ni score ; ce décompte
 * combiné n'a pas été revérifié depuis (voir `docs/design/HANDOFF.md`, lot 3
 * — seuls le score seul et la ligne de pipeline ont été recomptés au
 * 2 septembre 2026, à 10 et 137 sur 139 respectivement). Aucun code de cette
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
  /** `null` tant qu'aucune rédaction n'a été écrite pour ce prospect. */
  site: SiteView | null;
  /**
   * Le dernier message de chaque canal, du plus récent au plus ancien.
   *
   * Vide, et non `null` : `generated_message` archive, elle n'écrase pas, et
   * l'absence de ligne est ici indiscernable d'une table jamais alimentée.
   * Rien ne se perdrait à distinguer les deux, et rien ne s'y gagnerait.
   */
  messages: MessageView[];
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

/**
 * L'état du site généré d'un prospect.
 *
 * `redaction` porte ce que le MODÈLE a décidé — l'accroche, la présentation,
 * le choix et l'ordre des prestations. Les faits n'y sont pas : ils sont
 * ailleurs sur la fiche, tirés des mêmes colonnes, et les afficher deux fois
 * laisserait croire qu'il en existe deux versions. C'est aussi ce qui rend la
 * relecture tenable en une minute, comme l'annonce le §3 du plan : le
 * relecteur ne lit que ce qui a pu être inventé.
 */
export interface SiteView {
  repoUrl: string | null;
  /** L'URL en ligne — la donnée de vente, celle que le message cite. */
  deploymentUrl: string | null;
  promptVersion: string | null;
  model: string | null;
  generatedAt: string | null;
  publishedAt: string | null;
  /** Renseignée quand D5 a retiré le site : refus du prospect, ou péremption. */
  unpublishedAt: string | null;
  /**
   * Date du refus de relecture, s'il y en a eu un.
   *
   * Comparée à `generatedAt`, elle dit si la rédaction affichée est celle qui
   * a été refusée ou une nouvelle écrite depuis.
   */
  contentRejectedAt: string | null;
  redaction: RedactionView | null;
}

export interface RedactionView {
  accroche: string;
  presentation: string;
  /** Libellés déjà résolus : c'est le CHOIX et l'ORDRE qui viennent du modèle. */
  prestations: string[];
}

/** Un message archivé, tel qu'il a été rédigé. */
export interface MessageView {
  /** `email`, `sms` ou `appel` — colonne texte libre, pas une énumération. */
  channel: string;
  /** Seul l'email en a un. */
  subject: string | null;
  content: string;
  promptVersion: string;
  model: string;
  createdAt: string;
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
