import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getTrade } from '@prospeo/core';
import { mapSearchResponse } from './recherche-entreprises.js';

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
