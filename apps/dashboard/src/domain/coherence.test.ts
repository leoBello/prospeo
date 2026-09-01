import { describe, expect, it } from 'vitest';
import type { EnrichmentView, PresenceView, ProspectView, ScoreView } from './prospect.js';
import { dataWarnings } from './coherence.js';

const enrichissement = (patch: Partial<EnrichmentView> = {}): EnrichmentView => ({
  status: 'ok',
  phoneE164: null,
  phoneKind: null,
  rating: null,
  reviewCount: null,
  declaredUrl: null,
  matchedName: null,
  matchConfidence: null,
  enrichedAt: '2026-09-01T14:02:45Z',
  ...patch,
});

const presence = (patch: Partial<PresenceView> = {}): PresenceView => ({
  category: 'none',
  finalUrl: null,
  httpStatus: null,
  domainAvailable: null,
  probedAt: null,
  ...patch,
});

const scoreVue = (patch: Partial<ScoreView> = {}): ScoreView => ({
  total: 30,
  rulesetVersion: 'v2',
  computedAt: '2026-09-01T15:00:00Z',
  breakdown: [],
  ...patch,
});

function vue(patch: Partial<ProspectView> = {}): ProspectView {
  return {
    id: 'p1',
    siret: '78994813000032',
    denomination: 'AUBERT SERVICES',
    denominationUsuelle: null,
    tradeSlug: 'plombier',
    address: '5 RUE LE NOTRE',
    postalCode: '44000',
    city: 'NANTES',
    dateCreation: null,
    effectifCode: null,
    isClosed: false,
    discoveredAt: '2026-09-01T01:38:07Z',
    score: null,
    presence: null,
    enrichment: null,
    pipeline: null,
    ...patch,
  };
}

const kinds = (p: ProspectView, version = 'v2') => dataWarnings(p, version).map((w) => w.kind);

describe('dataWarnings', () => {
  it('ne signale rien quand tout concorde', () => {
    expect(
      kinds(
        vue({
          enrichment: enrichissement(),
          presence: presence(),
          score: scoreVue(),
        }),
      ),
    ).toEqual([]);
  });

  it('signale une categorie « aucune presence » dementie par un site declare', () => {
    // Cas reel sur 4 prospects : `none` signifie « aucune URL declaree et
    // aucun reseau social ». Une URL declaree ne nuance pas cette categorie,
    // elle la refute. Le prospect vaut alors −100 et non +35 : le score n'est
    // pas perime, il est inverse.
    const w = dataWarnings(
      vue({
        enrichment: enrichissement({ declaredUrl: 'https://aubert-services.fr/' }),
        presence: presence({ category: 'none' }),
        score: scoreVue(),
      }),
      'v2',
    );
    expect(w[0]).toEqual({
      kind: 'presence_contradicted',
      declaredUrl: 'https://aubert-services.fr/',
    });
  });

  it('ne crie pas au loup quand la categorie decoule justement de l URL declaree', () => {
    for (const category of ['social_only', 'directory_only', 'dead_site', 'has_site'] as const) {
      expect(
        kinds(
          vue({
            enrichment: enrichissement({ declaredUrl: 'https://facebook.com/x' }),
            presence: presence({ category }),
            score: scoreVue(),
          }),
        ),
      ).toEqual([]);
    }
  });

  it('signale un score calcule avant l enrichissement dont il depend', () => {
    // Observe sur les 25 scores : calcules a 01 h 52, enrichis vers 14 h 00.
    // Le total ignore le telephone, la note et le site decouverts depuis.
    expect(
      kinds(
        vue({
          enrichment: enrichissement({ enrichedAt: '2026-09-01T14:02:45Z' }),
          presence: presence(),
          score: scoreVue({ computedAt: '2026-09-01T01:52:38Z' }),
        }),
      ),
    ).toContain('score_predates_enrichment');
  });

  it('ne signale rien quand le score a ete recalcule apres l enrichissement', () => {
    expect(
      kinds(
        vue({
          enrichment: enrichissement({ enrichedAt: '2026-09-01T14:02:45Z' }),
          presence: presence(),
          score: scoreVue({ computedAt: '2026-09-01T15:00:00Z' }),
        }),
      ),
    ).toEqual([]);
  });

  it('signale un bareme perime', () => {
    expect(kinds(vue({ score: scoreVue({ rulesetVersion: 'v1' }) }), 'v2')).toEqual([
      'score_stale_ruleset',
    ]);
  });

  it('classe le dementi avant l anteriorite, et l anteriorite avant le bareme', () => {
    // Un chiffre inverse se corrige avant un chiffre en retard, qui se corrige
    // avant un chiffre calcule sous d'autres regles. L'ordre d'affichage est
    // celui de l'urgence.
    expect(
      kinds(
        vue({
          enrichment: enrichissement({ declaredUrl: 'https://x.fr/' }),
          presence: presence({ category: 'none' }),
          score: scoreVue({ computedAt: '2026-09-01T01:52:38Z', rulesetVersion: 'v1' }),
        }),
      ),
    ).toEqual(['presence_contradicted', 'score_predates_enrichment', 'score_stale_ruleset']);
  });

  it('ne reproche rien a un prospect simplement pas encore qualifie', () => {
    // 114 prospects sur 139 n'ont aucun satellite. L'absence n'est pas une
    // incoherence, et les couvrir d'avertissements noierait les vrais.
    expect(kinds(vue())).toEqual([]);
  });

  it('ne conclut rien d un horodatage illisible', () => {
    expect(
      kinds(
        vue({
          enrichment: enrichissement({ enrichedAt: 'pas une date' }),
          presence: presence(),
          score: scoreVue({ computedAt: '2026-09-01T01:52:38Z' }),
        }),
      ),
    ).toEqual([]);
  });
});
