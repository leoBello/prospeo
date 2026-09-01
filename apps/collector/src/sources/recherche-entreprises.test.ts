import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTrade } from '@prospeo/core';
import {
  fetchStatusBySiret,
  mapSearchResponse,
  searchEstablishments,
} from './recherche-entreprises.js';

const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('./fixtures/search-43-22A.json', import.meta.url)), 'utf8'),
) as unknown;

const plombier = getTrade('plombier')!;

describe('mapSearchResponse', () => {
  it('ne retient que l etablissement actif et diffusible', () => {
    const rows = mapSearchResponse(fixture, plombier);
    expect(rows.map((r) => r.siret)).toEqual(['11111111100017']);
  });

  it('mappe les champs du prospect', () => {
    const row = mapSearchResponse(fixture, plombier)[0]!;
    expect(row).toMatchObject({
      siret: '11111111100017',
      siren: '111111111',
      tradeSlug: 'plombier',
      denomination: 'SARL PLOMBERIE MARTIN',
      denominationUsuelle: 'Plomberie Martin',
      nafCode: '43.22A',
      postalCode: '44000',
      city: 'NANTES',
      dateCreation: '2016-03-01',
      effectifCode: '02',
      isEntrepreneurIndividuel: false,
      isHeadOffice: true,
    });
    expect(row.latitude).toBeCloseTo(47.2184, 4);
    expect(row.longitude).toBeCloseTo(-1.5536, 4);
  });

  it('exclut les entreprises non diffusibles', () => {
    const sirets = mapSearchResponse(fixture, plombier).map((r) => r.siret);
    expect(sirets).not.toContain('33333333300019');
  });

  it('exclut les etablissements non diffusibles', () => {
    const sirets = mapSearchResponse(fixture, plombier).map((r) => r.siret);
    expect(sirets).not.toContain('44444444400015');
  });

  it('exclut les etablissements fermes', () => {
    const sirets = mapSearchResponse(fixture, plombier).map((r) => r.siret);
    expect(sirets).not.toContain('22222222200011');
  });

  it('tolere une reponse vide sans lever', () => {
    expect(mapSearchResponse({ results: [] }, plombier)).toEqual([]);
    expect(mapSearchResponse({}, plombier)).toEqual([]);
  });
});

/** Construit une page de reponse minimale mais structurellement valide. */
function makePage(totalPages: number | undefined, sirets: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {
    results: sirets.map((siret) => ({
      siren: siret.slice(0, 9),
      nom_complet: `ENTREPRISE ${siret}`,
      statut_diffusion: 'O',
      matching_etablissements: [
        {
          siret,
          adresse: '1 RUE TEST 44000 NANTES',
          code_postal: '44000',
          libelle_commune: 'NANTES',
          etat_administratif: 'A',
          statut_diffusion_etablissement: 'O',
        },
      ],
    })),
  };
  if (totalPages !== undefined) body.total_pages = totalPages;
  return body;
}

describe('searchEstablishments', () => {
  it('parcourt toutes les pages annoncees', async () => {
    const urls: string[] = [];
    const pages = [makePage(2, ['11111111100017']), makePage(2, ['22222222200025'])];

    const seen: string[] = [];
    for await (const row of searchEstablishments({
      trade: plombier,
      postalCode: '44000',
      fetchPage: async (url) => {
        urls.push(url);
        return pages[urls.length - 1];
      },
    })) {
      seen.push(row.siret);
    }

    expect(seen).toEqual(['11111111100017', '22222222200025']);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('page=1');
    expect(urls[0]).toContain('per_page=25');
    expect(urls[1]).toContain('page=2');
  });

  it('ne tronque pas quand une page suivante omet total_pages', async () => {
    // Regression : total_pages ne doit etre lu que sur la PREMIERE reponse.
    // Le relire a chaque page ferait retomber la borne et arreterait la
    // collecte en silence.
    const pages = [
      makePage(3, ['11111111100017']),
      makePage(undefined, ['22222222200025']),
      makePage(undefined, ['33333333300033']),
    ];

    let calls = 0;
    const seen: string[] = [];
    for await (const row of searchEstablishments({
      trade: plombier,
      postalCode: '44000',
      fetchPage: async () => pages[calls++],
    })) {
      seen.push(row.siret);
    }

    expect(calls).toBe(3);
    expect(seen).toEqual(['11111111100017', '22222222200025', '33333333300033']);
  });

  it('echoue explicitement si la premiere page n annonce pas total_pages', async () => {
    const iterate = async (): Promise<void> => {
      for await (const _row of searchEstablishments({
        trade: plombier,
        postalCode: '44000',
        fetchPage: async () => makePage(undefined, ['11111111100017']),
      })) {
        // le premier tour doit lever avant d atteindre ce point
      }
    };

    await expect(iterate()).rejects.toThrow(/total_pages/);
  });

  it('propage une erreur survenue sur une page suivante', async () => {
    let calls = 0;
    const iterate = async (): Promise<void> => {
      for await (const _row of searchEstablishments({
        trade: plombier,
        postalCode: '44000',
        fetchPage: async () => {
          calls += 1;
          if (calls === 2) throw new Error('reseau coupe');
          return makePage(3, ['11111111100017']);
        },
      })) {
        // consommation
      }
    };

    await expect(iterate()).rejects.toThrow('reseau coupe');
    expect(calls).toBe(2);
  });

  it('transmet le code NAF avec son point dans l URL', async () => {
    let seenUrl = '';
    for await (const _row of searchEstablishments({
      trade: plombier,
      postalCode: '44000',
      fetchPage: async (url) => {
        seenUrl = url;
        return makePage(1, []);
      },
    })) {
      // aucune ligne attendue
    }

    expect(seenUrl).toContain('activite_principale=43.22A');
    expect(seenUrl).not.toContain('4322A&');
  });
});

/** Réponse minimale de l'API pour un SIRET donné. */
function entreprise(
  siret: string,
  options: {
    statutDiffusion?: string;
    statutDiffusionEtablissement?: string;
    etatAdministratif?: string;
  } = {},
): unknown {
  return {
    results: [
      {
        siren: siret.slice(0, 9),
        statut_diffusion: options.statutDiffusion ?? 'O',
        matching_etablissements: [
          {
            siret,
            statut_diffusion_etablissement: options.statutDiffusionEtablissement ?? 'O',
            etat_administratif: options.etatAdministratif ?? 'A',
          },
        ],
      },
    ],
  };
}

describe('fetchStatusBySiret', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stub(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
    const fetchMock = vi.fn(async () => ({ ok, status, json: async () => body }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('interroge l API sur le SIRET demandé', async () => {
    const fetchMock = stub(entreprise('11111111100017'));
    await fetchStatusBySiret('11111111100017');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('q=11111111100017');
  });

  it('rend actif un établissement ouvert et diffusible', async () => {
    stub(entreprise('11111111100017'));
    expect(await fetchStatusBySiret('11111111100017')).toEqual({ kind: 'active' });
  });

  it('rend cessé un établissement fermé', async () => {
    // L API code la cessation d un ETABLISSEMENT par « F », et non par le
    // « C » qu elle emploie au niveau de l entreprise.
    stub(entreprise('11111111100017', { etatAdministratif: 'F' }));
    expect(await fetchStatusBySiret('11111111100017')).toEqual({ kind: 'closed' });
  });

  it('rend non diffusible quand l entreprise ne l est plus', async () => {
    stub(entreprise('11111111100017', { statutDiffusion: 'P' }));
    expect(await fetchStatusBySiret('11111111100017')).toEqual({ kind: 'undiffusible' });
  });

  it('rend non diffusible quand l établissement ne l est plus', async () => {
    stub(entreprise('11111111100017', { statutDiffusionEtablissement: 'N' }));
    expect(await fetchStatusBySiret('11111111100017')).toEqual({ kind: 'undiffusible' });
  });

  it('rend absent sur une réponse sans résultat', async () => {
    stub({ results: [] });
    expect(await fetchStatusBySiret('11111111100017')).toEqual({ kind: 'absent' });
  });

  it('rend absent quand aucun établissement ne porte le SIRET', async () => {
    // Une recherche plein texte peut ramener des homonymes : seul le SIRET
    // exact fait foi.
    stub(entreprise('22222222200028'));
    expect(await fetchStatusBySiret('11111111100017')).toEqual({ kind: 'absent' });
  });

  it('lève sur une réponse HTTP en erreur', async () => {
    // Une erreur ne doit jamais se confondre avec une absence : elle
    // provoquerait une suppression irréversible.
    stub(null, false, 503);
    await expect(fetchStatusBySiret('11111111100017')).rejects.toThrow('503');
  });
});
