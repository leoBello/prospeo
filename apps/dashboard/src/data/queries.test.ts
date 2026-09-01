import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@prospeo/db';
import { PROSPECT_SELECT, loadProspects, prospectRangeReader, toProspectView } from './queries.js';

/**
 * Client simulé : enregistre la requête construite et rend les lignes fournies.
 * Aucun accès réseau — c'est le câblage de la requête qu'on éprouve.
 */
function fakeClient(pages: unknown[][]) {
  const appels = { table: '', select: '', order: '', ascending: true, ranges: [] as Array<[number, number]> };
  let page = 0;
  const client = {
    from(table: string) {
      appels.table = table;
      return {
        select(columns: string) {
          appels.select = columns;
          return {
            order(column: string, options?: { ascending?: boolean }) {
              appels.order = column;
              appels.ascending = options?.ascending ?? true;
              return {
                range(from: number, to: number) {
                  appels.ranges.push([from, to]);
                  const data = pages[page] ?? [];
                  page += 1;
                  return Promise.resolve({ data, error: null });
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient<Database>, appels };
}

const dtoMinimal = {
  id: 'p1',
  siret: '78994813000032',
  denomination: 'SARL ALLARD',
  denomination_usuelle: null,
  trade_slug: 'plombier',
  address: '5 RUE LE NOTRE 44000 NANTES',
  postal_code: '44000',
  city: 'NANTES',
  date_creation: '2012-12-15',
  effectif_code: '02',
  is_closed: false,
  discovered_at: '2026-09-01T01:38:07Z',
  prospect_score: null,
  web_presence: null,
  prospect_enrichment: null,
  prospect_pipeline: null,
};

describe('prospectRangeReader', () => {
  it('ordonne sur la cle primaire, sans quoi la pagination peut relire ou sauter des lignes', async () => {
    // PostgREST n'impose aucun ordre par défaut. Deux lignes de même rang
    // peuvent alors changer de place entre deux requêtes : l'une serait lue
    // deux fois, l'autre jamais, et le résultat aurait la bonne taille tout en
    // étant faux.
    const { client, appels } = fakeClient([[]]);
    await prospectRangeReader(client)(0, 999);
    expect(appels.order).toBe('id');
    expect(appels.table).toBe('prospect');
    expect(appels.ranges).toEqual([[0, 999]]);
  });

  it('demande les quatre satellites dans la meme requete, pour un instantane coherent', () => {
    for (const table of ['prospect_score', 'web_presence', 'prospect_enrichment', 'prospect_pipeline']) {
      expect(PROSPECT_SELECT).toContain(table);
    }
  });
});

describe('toProspectView', () => {
  it('conserve un satellite absent en null, et ne le remplace pas par un objet vide', () => {
    // Un `web_presence` vide se lirait comme « sondé, rien trouvé » ; l'absence
    // de ligne veut dire « pas encore sondé ». Ce ne sont pas les mêmes faits.
    const vue = toProspectView(dtoMinimal);
    expect(vue.score).toBeNull();
    expect(vue.presence).toBeNull();
    expect(vue.enrichment).toBeNull();
    expect(vue.pipeline).toBeNull();
  });

  it('accepte une relation un-a-un rendue sous forme de tableau', () => {
    // Selon la version de PostgREST et la façon dont la clé unique est
    // déclarée, une relation 1:1 revient tantôt en objet, tantôt en tableau
    // d'un élément. Traiter le tableau comme un objet perdrait silencieusement
    // le score de tous les prospects.
    const vue = toProspectView({
      ...dtoMinimal,
      prospect_score: [
        { total: 30, ruleset_version: 'v1', computed_at: '2026-09-01T00:00:00Z', breakdown: [] },
      ],
    });
    expect(vue.score?.total).toBe(30);
  });

  it('traite un tableau vide comme une absence de ligne', () => {
    expect(toProspectView({ ...dtoMinimal, web_presence: [] }).presence).toBeNull();
  });

  it('n invente pas un type de telephone que la base ne nomme pas', () => {
    // `phone_kind` est une colonne texte libre : une valeur inattendue doit
    // rester une absence, pas devenir « fixe » par défaut.
    const vue = toProspectView({
      ...dtoMinimal,
      prospect_enrichment: {
        status: 'ok',
        phone_e164: '+33612345678',
        phone_kind: 'satellite',
        rating: 4.6,
        review_count: null,
        declared_url: null,
        matched_name: 'Aquatio',
        match_confidence: 0.99,
        enriched_at: '2026-09-01T00:00:00Z',
      },
    });
    expect(vue.enrichment?.phoneKind).toBeNull();
    expect(vue.enrichment?.phoneE164).toBe('+33612345678');
  });

  it('lit le detail du bareme stocke en jsonb', () => {
    const vue = toProspectView({
      ...dtoMinimal,
      prospect_score: {
        total: 30,
        ruleset_version: 'v1',
        computed_at: '2026-09-01T00:00:00Z',
        breakdown: [
          { code: 'presence_none', group: 'presence', label: 'Aucune présence web', points: 35 },
        ],
      },
    });
    expect(vue.score?.breakdown).toHaveLength(1);
    expect(vue.score?.rulesetVersion).toBe('v1');
  });
});

describe('loadProspects', () => {
  it('parcourt toutes les pages, la base depassant deja le plafond d une lecture nue a terme', async () => {
    const page = (n: number, debut: number) =>
      Array.from({ length: n }, (_, i) => ({ ...dtoMinimal, id: `p${debut + i}` }));
    const read = vi
      .fn()
      .mockResolvedValueOnce({ data: page(3, 0), error: null })
      .mockResolvedValueOnce({ data: page(1, 3), error: null });

    const vues = await loadProspects(read, { pageSize: 3 });
    expect(vues.map((v) => v.id)).toEqual(['p0', 'p1', 'p2', 'p3']);
  });
});
