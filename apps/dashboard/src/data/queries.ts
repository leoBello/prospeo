import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Enums, Json } from '@prospeo/db';
import type { PhoneKind, WebPresenceCategory } from '@prospeo/core';
import { parseBreakdown } from '../domain/score.js';
import type {
  EnrichmentView,
  MessageView,
  PipelineView,
  PresenceView,
  ProspectView,
  RedactionView,
  ScoreView,
  SiteView,
} from '../domain/prospect.js';
import { fetchAllRows, type FetchAllOptions, type RangeReader } from './paginate.js';

/**
 * Les quatre satellites sont demandés dans la même requête que le prospect.
 *
 * Quatre lectures séparées seraient prises à des instants différents — et
 * l'enrichissement écrit en ce moment même dans `prospect_enrichment`. La
 * bande d'indicateurs et les listes de travail décriraient alors deux états
 * de la base légèrement décalés, avec des totaux qui ne se recoupent pas.
 */
export const PROSPECT_SELECT = [
  'id',
  'siret',
  'denomination',
  'denomination_usuelle',
  'trade_slug',
  'address',
  'postal_code',
  'city',
  'date_creation',
  'effectif_code',
  'is_closed',
  'discovered_at',
  'prospect_score(total,ruleset_version,computed_at,breakdown)',
  'web_presence(category,final_url,http_status,domain_available,probed_at)',
  'prospect_enrichment(status,phone_e164,phone_kind,rating,review_count,declared_url,matched_name,match_confidence,enriched_at)',
  'prospect_pipeline(status,next_action_at,updated_at)',
  'prospect_site(repo_url,deployment_url,prompt_version,model,generated_at,published_at,unpublished_at,content_rejected_at,content)',
  'generated_message(channel,subject,content,prompt_version,model,created_at)',
].join(',');

/**
 * Construit le lecteur de tranches attendu par `fetchAllRows`.
 *
 * L'`order` sur `id` n'est pas décoratif : PostgREST n'impose aucun ordre par
 * défaut, et sans ordre total déterministe deux lignes de même rang peuvent
 * changer de place entre deux requêtes. Une serait lue deux fois, l'autre
 * jamais — et le résultat aurait la bonne taille tout en étant faux.
 */
export function prospectRangeReader(client: SupabaseClient<Database>): RangeReader<unknown> {
  return (from, to) =>
    client
      .from('prospect')
      .select(PROSPECT_SELECT)
      .order('id', { ascending: true })
      .range(from, to) as unknown as ReturnType<RangeReader<unknown>>;
}

/**
 * Ramène une relation un-à-un à un objet ou à `null`.
 *
 * PostgREST rend une relation 1:1 tantôt en objet, tantôt en tableau d'un
 * élément, selon la version et la façon dont l'unicité est déclarée. Traiter
 * l'un comme l'autre ferait disparaître silencieusement le score de tous les
 * prospects — sans erreur, puisqu'un tableau est un objet valide.
 */
function unique(value: unknown): Record<string, unknown> | null {
  const cible = Array.isArray(value) ? value[0] : value;
  return typeof cible === 'object' && cible !== null ? (cible as Record<string, unknown>) : null;
}

const CATEGORIES: readonly WebPresenceCategory[] = [
  'none',
  'social_only',
  'directory_only',
  'dead_site',
  'has_site',
];

const STATUTS_ENRICHISSEMENT: readonly Enums<'enrichment_status'>[] = [
  'ok',
  'not_found',
  'ambiguous',
  'blocked',
];

const STATUTS_PIPELINE: readonly Enums<'pipeline_status'>[] = [
  'a_contacter',
  'contacte',
  'relance',
  'interesse',
  'gagne',
  'perdu',
  'ne_pas_contacter',
];

function texte(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function nombre(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleen(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

/**
 * `phone_kind` est une colonne texte libre, pas une énumération Postgres.
 *
 * Une valeur inattendue reste donc une absence de type connu. Replier sur
 * « fixe » ferait perdre les +20 du barème mobile sans que rien ne le
 * signale, et pire, ferait croire l'artisan joignable au bureau.
 */
function typeDeTelephone(value: unknown): PhoneKind | null {
  return value === 'mobile' || value === 'landline' ? value : null;
}

function toScore(raw: unknown): ScoreView | null {
  const o = unique(raw);
  if (o === null) return null;
  const total = nombre(o['total']);
  if (total === null) return null;
  return {
    total,
    rulesetVersion: texte(o['ruleset_version']) ?? '',
    computedAt: texte(o['computed_at']) ?? '',
    breakdown: parseBreakdown((o['breakdown'] ?? null) as Json),
  };
}

function toPresence(raw: unknown): PresenceView | null {
  const o = unique(raw);
  if (o === null) return null;
  const categorie = o['category'];
  return {
    category: CATEGORIES.includes(categorie as WebPresenceCategory)
      ? (categorie as WebPresenceCategory)
      : null,
    finalUrl: texte(o['final_url']),
    httpStatus: nombre(o['http_status']),
    domainAvailable: booleen(o['domain_available']),
    probedAt: texte(o['probed_at']),
  };
}

function toEnrichment(raw: unknown): EnrichmentView | null {
  const o = unique(raw);
  if (o === null) return null;
  const statut = o['status'];
  if (!STATUTS_ENRICHISSEMENT.includes(statut as Enums<'enrichment_status'>)) return null;
  return {
    status: statut as Enums<'enrichment_status'>,
    phoneE164: texte(o['phone_e164']),
    phoneKind: typeDeTelephone(o['phone_kind']),
    rating: nombre(o['rating']),
    reviewCount: nombre(o['review_count']),
    declaredUrl: texte(o['declared_url']),
    matchedName: texte(o['matched_name']),
    matchConfidence: nombre(o['match_confidence']),
    enrichedAt: texte(o['enriched_at']) ?? '',
  };
}

function toPipeline(raw: unknown): PipelineView | null {
  const o = unique(raw);
  if (o === null) return null;
  const statut = o['status'];
  if (!STATUTS_PIPELINE.includes(statut as Enums<'pipeline_status'>)) return null;
  return {
    status: statut as Enums<'pipeline_status'>,
    nextActionAt: texte(o['next_action_at']),
    updatedAt: texte(o['updated_at']) ?? '',
  };
}

/**
 * La rédaction, extraite du contenu publié.
 *
 * Le `jsonb` a été validé contre son schéma AU MOMENT de l'écriture, par
 * `runGenerate`. Il n'est pas revalidé ici : la couche d'affichage n'a pas
 * qualité à trancher qu'un contenu déjà publié sous le nom d'une entreprise
 * est invalide. Elle se contente de ne rien afficher de ce qu'elle ne
 * reconnaît pas — un contenu écrit sous un schéma futur laisse la section
 * vide plutôt que de faire tomber l'écran.
 */
function toRedaction(raw: unknown): RedactionView | null {
  const contenu = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : null;
  const r = contenu === null ? null : unique(contenu['redaction']);
  if (r === null) return null;

  const accroche = texte(r['accroche']);
  const presentation = texte(r['presentation']);
  if (accroche === null || presentation === null) return null;

  // Les prestations arrivent RÉSOLUES dans `ContenuPublie` : des objets
  // `{code, label, description}`, et non des codes. C'est `label` qu'un
  // relecteur lit, et `code` qui n'a de sens que pour `trades.ts`.
  const brutes = r['prestations'];
  const prestations = Array.isArray(brutes)
    ? brutes
        .map((p) => texte(unique(p)?.['label'] ?? null))
        .filter((l): l is string => l !== null)
    : [];

  return { accroche, presentation, prestations };
}

function toSite(raw: unknown): SiteView | null {
  const o = unique(raw);
  if (o === null) return null;
  return {
    repoUrl: texte(o['repo_url']),
    deploymentUrl: texte(o['deployment_url']),
    promptVersion: texte(o['prompt_version']),
    model: texte(o['model']),
    generatedAt: texte(o['generated_at']),
    publishedAt: texte(o['published_at']),
    unpublishedAt: texte(o['unpublished_at']),
    contentRejectedAt: texte(o['content_rejected_at']),
    redaction: toRedaction(o['content']),
  };
}

/**
 * Les messages archivés, le plus récent de chaque canal d'abord.
 *
 * `generated_message` ARCHIVE : une régénération ajoute des lignes sans
 * effacer les précédentes, et un prospect rejoué trois fois en porte neuf. Les
 * afficher toutes noierait le texte à copier sous ses brouillons ; n'en garder
 * qu'un par canal les rend lisibles sans rien détruire — l'historique reste en
 * base pour qui le cherche.
 *
 * Le tri est fait ICI et non par PostgREST : ordonner une relation imbriquée
 * demande une option par relation, qu'un ajout de colonne ferait silencieusement
 * tomber. Sur trois lignes, le tri client est exact et ne peut pas se perdre.
 */
function toMessages(raw: unknown): MessageView[] {
  if (!Array.isArray(raw)) return [];

  const toutes: MessageView[] = [];
  for (const brut of raw) {
    const o = unique(brut);
    if (o === null) continue;
    const channel = texte(o['channel']);
    const content = texte(o['content']);
    if (channel === null || content === null) continue;
    toutes.push({
      channel,
      subject: texte(o['subject']),
      content,
      promptVersion: texte(o['prompt_version']) ?? '',
      model: texte(o['model']) ?? '',
      createdAt: texte(o['created_at']) ?? '',
    });
  }

  toutes.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

  const vus = new Set<string>();
  return toutes.filter((m) => {
    if (vus.has(m.channel)) return false;
    vus.add(m.channel);
    return true;
  });
}

/** Traduit une ligne PostgREST en vue d'interface. */
export function toProspectView(raw: unknown): ProspectView {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    id: texte(o['id']) ?? '',
    siret: texte(o['siret']) ?? '',
    denomination: texte(o['denomination']) ?? '',
    denominationUsuelle: texte(o['denomination_usuelle']),
    tradeSlug: texte(o['trade_slug']) ?? '',
    address: texte(o['address']) ?? '',
    postalCode: texte(o['postal_code']) ?? '',
    city: texte(o['city']) ?? '',
    dateCreation: texte(o['date_creation']),
    effectifCode: texte(o['effectif_code']),
    isClosed: booleen(o['is_closed']) ?? false,
    discoveredAt: texte(o['discovered_at']) ?? '',
    score: toScore(o['prospect_score']),
    presence: toPresence(o['web_presence']),
    enrichment: toEnrichment(o['prospect_enrichment']),
    pipeline: toPipeline(o['prospect_pipeline']),
    site: toSite(o['prospect_site']),
    messages: toMessages(o['generated_message']),
  };
}

/**
 * Lit la totalité des prospects, satellites compris.
 *
 * Une seule lecture paginée alimente à la fois la bande d'indicateurs et les
 * listes de travail : à l'échelle de quelques milliers de lignes, un aller-
 * retour de plus coûte moins qu'une requête d'agrégat par indicateur, et cela
 * garantit surtout que tout l'écran décrit le même instantané.
 */
export async function loadProspects(
  read: RangeReader<unknown>,
  options?: FetchAllOptions,
): Promise<ProspectView[]> {
  const lignes = await fetchAllRows(read, options);
  return lignes.map(toProspectView);
}
