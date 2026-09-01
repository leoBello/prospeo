import { request } from 'undici';
import type { RawEstablishment, Trade } from '@prospeo/core';

const BASE_URL = 'https://recherche-entreprises.api.gouv.fr/search';
/** Plafond imposé par l'API. */
const MAX_PER_PAGE = 25;

interface Etablissement {
  siret?: unknown;
  adresse?: unknown;
  code_postal?: unknown;
  libelle_commune?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  activite_principale?: unknown;
  etat_administratif?: unknown;
  statut_diffusion_etablissement?: unknown;
  est_siege?: unknown;
  nom_commercial?: unknown;
  liste_enseignes?: unknown;
}

interface Entreprise {
  siren?: unknown;
  nom_complet?: unknown;
  statut_diffusion?: unknown;
  date_creation?: unknown;
  tranche_effectif_salarie?: unknown;
  complements?: { est_entrepreneur_individuel?: unknown } | null;
  matching_etablissements?: unknown;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * L'API filtre `activite_principale` au niveau de l'entreprise et
 * `code_postal` au niveau de l'établissement : la vérité territoriale se
 * trouve dans `matching_etablissements`, jamais dans `siege`.
 */
export function mapSearchResponse(json: unknown, trade: Trade): RawEstablishment[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];

  const rows: RawEstablishment[] = [];

  for (const raw of results as Entreprise[]) {
    if (str(raw.statut_diffusion) !== 'O') continue;

    const siren = str(raw.siren);
    const denomination = str(raw.nom_complet);
    if (siren === null || denomination === null) continue;

    const etablissements = Array.isArray(raw.matching_etablissements)
      ? (raw.matching_etablissements as Etablissement[])
      : [];

    for (const etab of etablissements) {
      if (str(etab.etat_administratif) !== 'A') continue;
      if (str(etab.statut_diffusion_etablissement) !== 'O') continue;

      const siret = str(etab.siret);
      const address = str(etab.adresse);
      const postalCode = str(etab.code_postal);
      const city = str(etab.libelle_commune);
      if (siret === null || address === null || postalCode === null || city === null) continue;

      const enseignes = Array.isArray(etab.liste_enseignes) ? etab.liste_enseignes : [];
      const usuelle = str(etab.nom_commercial) ?? str(enseignes[0]);

      rows.push({
        siret,
        siren,
        tradeSlug: trade.slug,
        denomination,
        denominationUsuelle: usuelle,
        nafCode: str(etab.activite_principale),
        address,
        postalCode,
        city,
        latitude: num(etab.latitude),
        longitude: num(etab.longitude),
        dateCreation: str(raw.date_creation),
        effectifCode: str(raw.tranche_effectif_salarie),
        isEntrepreneurIndividuel: raw.complements?.est_entrepreneur_individuel === true,
        isHeadOffice: etab.est_siege === true,
      });
    }
  }

  return rows;
}

export interface SearchOptions {
  trade: Trade;
  postalCode: string;
  /** Injecté dans les tests. */
  fetchPage?: (url: string) => Promise<unknown>;
}

async function defaultFetchPage(url: string): Promise<unknown> {
  const response = await request(url, { headers: { accept: 'application/json' } });
  if (response.statusCode !== 200) {
    throw new Error(`API Recherche d'entreprises : HTTP ${response.statusCode}`);
  }
  return response.body.json();
}

/** Itère toutes les pages pour un métier et un code postal. */
export async function* searchEstablishments(
  options: SearchOptions,
): AsyncIterable<RawEstablishment> {
  const fetchPage = options.fetchPage ?? defaultFetchPage;
  const naf = options.trade.nafCodes.join(',');

  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const url =
      `${BASE_URL}?activite_principale=${encodeURIComponent(naf)}` +
      `&code_postal=${encodeURIComponent(options.postalCode)}` +
      `&page=${page}&per_page=${MAX_PER_PAGE}`;

    const json = await fetchPage(url);
    const meta = json as { total_pages?: unknown };
    totalPages = typeof meta.total_pages === 'number' ? meta.total_pages : page;

    for (const row of mapSearchResponse(json, options.trade)) yield row;
    page += 1;
  }
}
