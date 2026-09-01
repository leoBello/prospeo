import { describe, expect, it, vi } from 'vitest';
import { MATCHING_CONFIG, getTrade, type MapsCandidate } from '@prospeo/core';
import { buildEnrichmentRow, runEnrich, type EnrichProspect } from './enrich.js';
import { BlockedError } from '../sources/google-maps.js';

const trade = getTrade('plombier');
if (trade === undefined) throw new Error('métier plombier absent');

const prospect: EnrichProspect = {
  id: 'p1',
  denomination: 'SARL ALLARD',
  denominationUsuelle: null,
  city: 'NANTES',
  address: '11 rue Auguste Brizeux 44000 NANTES',
  latitude: 47.2213,
  longitude: -1.5601,
};

function candidate(over: Partial<MapsCandidate> = {}): MapsCandidate {
  return {
    name: 'Allard Plomberie',
    address: null,
    latitude: 47.2214,
    longitude: -1.5602,
    category: 'Plombier',
    phone: '02 40 00 00 00',
    website: 'https://facebook.com/allard',
    rating: 4.6,
    reviewCount: 31,
    placeId: 'abc',
    mapsUrl: 'https://maps.google.com/1',
    ...over,
  };
}

describe('buildEnrichmentRow', () => {
  it('écrit les champs de la fiche quand la fusion est automatique', () => {
    const row = buildEnrichmentRow(prospect, [candidate()], trade, MATCHING_CONFIG);
    expect(row.status).toBe('ok');
    expect(row.phone_e164).toBe('+33240000000');
    expect(row.declared_url).toBe('https://facebook.com/allard');
    expect(row.rating).toBe(4.6);
    expect(row.match_confidence).toBeGreaterThan(MATCHING_CONFIG.highThreshold);
  });

  /**
   * Candidat volontairement ambigu : même patronyme et même adresse, mais une
   * catégorie Google qui ne recoupe pas le métier.
   *
   * Mesuré : confiance 0,7188 — nom 0,80 (plafond patronyme unique), soit
   * 0,48, plus 0,2388 de proximité, plus 0 de catégorie. C'est entre
   * `lowThreshold` (0,55) et `highThreshold` (0,85), donc `ambiguous`.
   */
  function ambigu(): MapsCandidate {
    return candidate({ name: 'Allard Multiservices', category: 'Entreprise de rénovation' });
  }

  it('n écrit aucune donnée de fiche quand le cas est ambigu', () => {
    // Écrire un téléphone non validé le rendrait indiscernable d un
    // téléphone confirmé, et il finirait composé.
    const row = buildEnrichmentRow(prospect, [ambigu()], trade, MATCHING_CONFIG);
    expect(row.status).toBe('ambiguous');
    expect(row.phone_e164).toBeNull();
    expect(row.declared_url).toBeNull();
  });

  it('conserve les candidats ambigus pour la revue', () => {
    const row = buildEnrichmentRow(prospect, [ambigu()], trade, MATCHING_CONFIG);
    expect(Array.isArray(row.candidates)).toBe(true);
    expect(row.candidates).toHaveLength(1);
  });

  it('marque not_found sans candidat', () => {
    const row = buildEnrichmentRow(prospect, [], trade, MATCHING_CONFIG);
    expect(row.status).toBe('not_found');
    expect(row.matched_name).toBeNull();
  });

  it('classe une URL de site propre comme telle', () => {
    const row = buildEnrichmentRow(
      prospect,
      [candidate({ website: 'https://allard-plomberie.fr' })],
      trade,
      MATCHING_CONFIG,
    );
    expect(row.declared_url).toBe('https://allard-plomberie.fr');
  });
});

describe('runEnrich', () => {
  function source(results: MapsCandidate[][]) {
    let call = 0;
    return {
      search: vi.fn(async () => results[call++] ?? []),
      close: vi.fn(async () => undefined),
    };
  }

  it('écrit une ligne par prospect', async () => {
    const upsert = vi.fn(async () => undefined);
    const report = await runEnrich({
      prospects: [prospect],
      trade,
      config: MATCHING_CONFIG,
      source: source([[candidate()]]),
      upsert,
      dailyRemaining: 10,
    });
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(report).toMatchObject({ processed: 1, ok: 1, blocked: false });
  });

  it('s arrête au plafond journalier sans le dépasser', async () => {
    const upsert = vi.fn(async () => undefined);
    const report = await runEnrich({
      prospects: [prospect, { ...prospect, id: 'p2' }, { ...prospect, id: 'p3' }],
      trade,
      config: MATCHING_CONFIG,
      source: source([[candidate()], [candidate()], [candidate()]]),
      upsert,
      dailyRemaining: 2,
    });
    expect(report.processed).toBe(2);
    expect(report.stoppedByCap).toBe(true);
  });

  it('interrompt le run sur BlockedError et marque le prospect', async () => {
    const upsert = vi.fn(async () => undefined);
    const blocking = {
      search: vi.fn(async () => {
        throw new BlockedError('https://google.com/sorry/index');
      }),
      close: vi.fn(async () => undefined),
    };
    const report = await runEnrich({
      prospects: [prospect, { ...prospect, id: 'p2' }],
      trade,
      config: MATCHING_CONFIG,
      source: blocking,
      upsert,
      dailyRemaining: 10,
    });
    expect(report.blocked).toBe(true);
    expect(report.processed).toBe(0);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'blocked' }));
    // Le second prospect n est pas tenté : marteler une protection la durcit.
    expect(blocking.search).toHaveBeenCalledTimes(1);
  });

  it('poursuit le run malgré une erreur isolée sur un prospect', async () => {
    const upsert = vi.fn(async () => undefined);
    let call = 0;
    const flaky = {
      search: vi.fn(async () => {
        call += 1;
        if (call === 1) throw new Error('temps dépassé');
        return [candidate()];
      }),
      close: vi.fn(async () => undefined),
    };
    const report = await runEnrich({
      prospects: [prospect, { ...prospect, id: 'p2' }],
      trade,
      config: MATCHING_CONFIG,
      source: flaky,
      upsert,
      dailyRemaining: 10,
    });
    expect(report.failed).toBe(1);
    expect(report.ok).toBe(1);
    expect(report.blocked).toBe(false);
  });
});
