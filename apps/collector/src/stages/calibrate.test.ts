import { describe, expect, it } from 'vitest';
import { MATCHING_CONFIG, getTrade, type MatchingConfig, type Trade } from '@prospeo/core';
import {
  replayEnrichment,
  rewriteFromReplay,
  summarizeReplays,
  type StoredEnrichment,
} from './calibrate.js';
import type { ReviewCandidate } from './enrich.js';

const plombier = getTrade('plombier');
if (plombier === undefined) throw new Error('métier plombier absent');
// Annoté : une fonction déclarée est hissée, et TypeScript n y reporte pas le
// rétrécissement obtenu par le garde ci-dessus.
const trade: Trade = plombier;

function stored(over: Partial<ReviewCandidate> = {}): ReviewCandidate {
  return {
    name: 'Allard Plomberie',
    address: '11 rue Auguste Brizeux',
    phone: '02 40 00 00 00',
    website: null,
    mapsUrl: 'https://maps.google.com/1',
    rating: 4.6,
    placeId: 'abc',
    latitude: 47.2214,
    longitude: -1.5602,
    category: 'Plombier',
    reviewCount: 31,
    confidence: 0.93,
    lines: [],
    rejectedFor: null,
    ...over,
  };
}

const ENRICHED_AT = '2026-08-15T09:30:00.000Z';

function row(over: Partial<StoredEnrichment> = {}): StoredEnrichment {
  return {
    prospectId: 'p1',
    enrichedAt: ENRICHED_AT,
    decidedBy: 'matcher',
    denomination: 'SARL ALLARD',
    denominationUsuelle: null,
    latitude: 47.2213,
    longitude: -1.5601,
    trade,
    status: 'ok',
    matchedName: 'Allard Plomberie',
    candidates: [stored()],
    ...over,
  };
}

describe('replayEnrichment', () => {
  it('refait le même verdict sous la configuration qui l a produit', () => {
    const replay = replayEnrichment(row(), MATCHING_CONFIG);
    expect(replay.unreplayable).toBeNull();
    expect(replay.replayed?.status).toBe('ok');
    expect(replay.replayed?.matchedName).toBe('Allard Plomberie');
    expect(replay.changed).toBe(false);
  });

  it('montre qu un seuil haut relevé renvoie la fusion en revue', () => {
    // C est l usage même de la commande : bouger un nombre, et voir ce que
    // la base d hier serait devenue — sans redemander quoi que ce soit à
    // Google.
    const severe: MatchingConfig = { ...MATCHING_CONFIG, version: 'test', highThreshold: 0.99 };
    const replay = replayEnrichment(row(), severe);
    expect(replay.replayed?.status).toBe('ambiguous');
    expect(replay.changed).toBe(true);
  });

  it('montre qu une distance desserrée repêche un candidat éliminé', () => {
    // Troisième question du jalon. Le candidat est à ~4,3 km : éliminé net à
    // 300 m, repêché à 5 km. Sans la trace, ce test serait impossible à
    // écrire, et la question impossible à trancher autrement qu en rescrapant.
    const loin = stored({ latitude: 47.26, longitude: -1.5601, rejectedFor: 'distance' });
    const introuvable = row({ status: 'not_found', matchedName: null, candidates: [loin] });
    expect(replayEnrichment(introuvable, MATCHING_CONFIG).replayed?.status).toBe('not_found');

    // Repêché vers la REVUE, et non vers la fusion : à 4,3 km sur un plafond
    // de 5 km la proximité ne vaut plus que 0,14, ce qui laisse la confiance
    // dans la bande ambiguë. C est le bon comportement — desserrer la
    // distance doit rendre un cas à l humain, pas le faire fusionner tout
    // seul depuis l autre bout de l agglomération.
    const large: MatchingConfig = { ...MATCHING_CONFIG, version: 'test', maxDistanceM: 5000 };
    const repeche = replayEnrichment(introuvable, large);
    expect(repeche.replayed?.status).toBe('ambiguous');
    expect(repeche.changed).toBe(true);
  });

  it('refuse de rejouer une ligne écrite avant l enregistrement complet', () => {
    // Une fiche sans coordonnées enregistrées ne permet pas de recalculer la
    // distance : la rejouer produirait un verdict faux présenté comme sûr.
    // `null` est une coordonnée absente et reste rejouable ; `undefined` est
    // un champ jamais écrit, et ne l est pas.
    const ancienne = { ...stored() } as Partial<ReviewCandidate>;
    delete ancienne.latitude;
    const replay = replayEnrichment(
      row({ candidates: [ancienne as ReviewCandidate] }),
      MATCHING_CONFIG,
    );
    expect(replay.replayed).toBeNull();
    expect(replay.unreplayable).toContain('antérieure');
  });

  it('refuse de rejouer une fusion dont aucun candidat n a été gardé', () => {
    const replay = replayEnrichment(row({ candidates: [] }), MATCHING_CONFIG);
    expect(replay.replayed).toBeNull();
  });

  it('refuse de rejouer une ligne bloquée, qui n a rien lu du tout', () => {
    const replay = replayEnrichment(
      row({ status: 'blocked', matchedName: null, candidates: [] }),
      MATCHING_CONFIG,
    );
    expect(replay.replayed).toBeNull();
    expect(replay.unreplayable).toContain('bloqué');
  });

  it('rejoue un introuvable sans candidat, qui ne perd aucune information', () => {
    // `not_found` avec zéro candidat dit la même chose hier et aujourd hui :
    // rien n a été retenu. Le refuser priverait la calibration de la moitié
    // de sa population sans rien protéger.
    const replay = replayEnrichment(
      row({ status: 'not_found', matchedName: null, candidates: [] }),
      MATCHING_CONFIG,
    );
    expect(replay.unreplayable).toBeNull();
    expect(replay.replayed?.status).toBe('not_found');
    expect(replay.changed).toBe(false);
  });

  it('signale un changement de fiche retenue, à statut identique', () => {
    // Les deux runs disent `ok`, mais pas sur la même entreprise : ce n est
    // pas le même numéro au bout du fil. Comparer les seuls statuts
    // laisserait passer exactement le genre d erreur qui se paie en appel.
    const replay = replayEnrichment(
      row({ matchedName: 'Une Toute Autre Plomberie' }),
      MATCHING_CONFIG,
    );
    expect(replay.replayed?.status).toBe('ok');
    expect(replay.replayed?.matchedName).toBe('Allard Plomberie');
    expect(replay.changed).toBe(true);
  });
});

describe('summarizeReplays', () => {
  it('compte les verdicts, les divergences et les lignes hors jeu', () => {
    const summary = summarizeReplays([
      replayEnrichment(row(), MATCHING_CONFIG),
      replayEnrichment(row({ prospectId: 'p2' }), { ...MATCHING_CONFIG, highThreshold: 0.99 }),
      replayEnrichment(row({ prospectId: 'p3', status: 'blocked', candidates: [] }), MATCHING_CONFIG),
    ]);
    expect(summary.replayed).toBe(2);
    expect(summary.unreplayable).toBe(1);
    expect(summary.changed).toBe(1);
    expect(summary.byStatus.ok).toBe(1);
    expect(summary.byStatus.ambiguous).toBe(1);
  });

  it('compte les candidats éliminés par motif, sur les seules lignes rejouées', () => {
    // Le décompte qui dit si `maxDistanceM` mérite d être desserré : combien
    // de fiches la distance a-t-elle écartées, et non « combien de prospects
    // sont introuvables ».
    const loin = stored({ latitude: 47.26, longitude: -1.5601 });
    const summary = summarizeReplays([
      replayEnrichment(
        row({ status: 'not_found', matchedName: null, candidates: [loin] }),
        MATCHING_CONFIG,
      ),
    ]);
    expect(summary.eliminated.distance).toBe(1);
    expect(summary.eliminated.confiance).toBe(0);
  });
});

describe('rewriteFromReplay — propager un reglage sans effacer un humain', () => {
  it('reecrit le verdict d une ligne tranchee par la machine', () => {
    const replay = replayEnrichment(row(), MATCHING_CONFIG);
    const rewritten = rewriteFromReplay(row(), replay);
    expect(rewritten?.status).toBe('ok');
    expect(rewritten?.matched_name).toBe('Allard Plomberie');
    expect(rewritten?.decided_by).toBe('matcher');
  });

  it('refuse de toucher une ligne tranchee par un humain', () => {
    // La donnee la plus chere de la base : un operateur a regarde les fiches
    // et choisi. Aucun recalcul ne doit la contredire dans son dos — elle est
    // la seule que rien ne permette de reconstituer.
    const humaine = row({ decidedBy: 'human', matchedName: 'Choix de l operateur' });
    const replay = replayEnrichment(humaine, MATCHING_CONFIG);
    expect(rewriteFromReplay(humaine, replay)).toBeNull();
  });

  it('reprend l horodatage d enrichissement au lieu de le rafraichir', () => {
    // Aucune requete n est partie chez Google : rafraichir `enriched_at`
    // ferait consommer au scraping du lendemain le quota d un simple
    // recalcul. Meme raison qu en revue.
    const replay = replayEnrichment(row(), MATCHING_CONFIG);
    expect(rewriteFromReplay(row(), replay)?.enriched_at).toBe(ENRICHED_AT);
  });

  it('ne reecrit pas ce qui n a pas pu etre rejoue', () => {
    const bloquee = row({ status: 'blocked', matchedName: null, candidates: [] });
    const replay = replayEnrichment(bloquee, MATCHING_CONFIG);
    expect(rewriteFromReplay(bloquee, replay)).toBeNull();
  });

  it('conserve la trace des candidats, renotee sous la configuration appliquee', () => {
    const replay = replayEnrichment(row(), MATCHING_CONFIG);
    const rewritten = rewriteFromReplay(row(), replay);
    expect(rewritten?.candidates).toHaveLength(1);
    expect(rewritten?.candidates[0]?.latitude).toBe(47.2214);
  });
});
