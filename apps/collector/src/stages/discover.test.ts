import { describe, expect, it, vi } from 'vitest';
import { getTrade, type RawEstablishment } from '@prospeo/core';
import { runDiscover } from './discover.js';

const row = (siret: string): RawEstablishment => ({
  siret,
  siren: siret.slice(0, 9),
  tradeSlug: 'plombier',
  denomination: 'PLOMBERIE MARTIN',
  denominationUsuelle: null,
  nafCode: '43.22A',
  address: '12 RUE DE LA PAIX 44000 NANTES',
  postalCode: '44000',
  city: 'NANTES',
  latitude: 47.2,
  longitude: -1.5,
  dateCreation: '2016-03-01',
  effectifCode: '02',
  isEntrepreneurIndividuel: false,
  isHeadOffice: true,
});

describe('runDiscover', () => {
  it('ecrit un prospect a la fois et rend un rapport', async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const report = await runDiscover({
      trade: getTrade('plombier')!,
      postalCode: '44000',
      source: async function* () {
        yield row('11111111100017');
        yield row('22222222200011');
      },
      upsertProspect: upsert,
    });

    expect(report).toEqual({ seen: 2, upserted: 2 });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]?.[0]?.siret).toBe('11111111100017');
  });

  it('respecte le plafond de limit', async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const report = await runDiscover({
      trade: getTrade('plombier')!,
      postalCode: '44000',
      limit: 1,
      source: async function* () {
        yield row('11111111100017');
        yield row('22222222200011');
      },
      upsertProspect: upsert,
    });

    expect(report).toEqual({ seen: 1, upserted: 1 });
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it('poursuit apres l echec d un enregistrement isole', async () => {
    const upsert = vi
      .fn()
      .mockRejectedValueOnce(new Error('conflit'))
      .mockResolvedValue(undefined);

    const report = await runDiscover({
      trade: getTrade('plombier')!,
      postalCode: '44000',
      source: async function* () {
        yield row('11111111100017');
        yield row('22222222200011');
      },
      upsertProspect: upsert,
    });

    expect(report).toEqual({ seen: 2, upserted: 1 });
  });
});
