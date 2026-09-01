import { describe, expect, it, vi } from 'vitest';
import { MATCHING_CONFIG, getTrade, type MapsCandidate } from '@prospeo/core';
import {
  buildEnrichmentRow,
  runEnrich,
  type EnrichmentRow,
  type EnrichProspect,
} from './enrich.js';
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
   * Mesuré sous le réglage v3 : confiance 0,7666 — nom 0,80 (plafond
   * patronyme unique), soit 0,52, plus 0,2466 de proximité, plus 0 de
   * catégorie. C'est entre `lowThreshold` (0,55) et `highThreshold` (0,85),
   * donc `ambiguous`.
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

  it('n écrit pas social_urls, colonne que enrich ne peuple jamais', () => {
    // La poser à [] écraserait sur conflit une donnée que l étage ne connaît
    // pas ; l omettre la préserve, la colonne ayant un défaut en base.
    const row = buildEnrichmentRow(prospect, [candidate()], trade, MATCHING_CONFIG);
    expect(row).not.toHaveProperty('social_urls');
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

  it('essaie la requête suivante quand la première ne retient aucun candidat', async () => {
    // La règle est « arrêt à la première requête qui produit un candidat
    // *retenu* ». S arrêter au premier candidat trouvé condamnerait ce
    // prospect à un `not_found` définitif, faute d avoir essayé la requête
    // par raison sociale — celle qui trouve la bonne fiche.
    const upsert = vi.fn(async () => undefined);
    const searching = source([
      [candidate({ name: 'Boulangerie Dupont', category: 'Boulangerie' })],
      [candidate()],
    ]);
    const report = await runEnrich({
      prospects: [prospect],
      trade,
      config: MATCHING_CONFIG,
      source: searching,
      upsert,
      dailyRemaining: 10,
    });
    expect(report.ok).toBe(1);
    expect(searching.search).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ status: 'ok' }));
  });

  it('interrompt le run après trois échecs d écriture consécutifs', async () => {
    // Au-delà ce n est plus un incident mais une panne : continuer ne ferait
    // que consommer du quota Google pour jeter le résultat.
    const upsert = vi.fn(async () => {
      throw new Error('permission denied for table prospect_enrichment');
    });
    const searching = source([[candidate()], [candidate()], [candidate()], [candidate()]]);
    const report = await runEnrich({
      prospects: [
        prospect,
        { ...prospect, id: 'p2' },
        { ...prospect, id: 'p3' },
        { ...prospect, id: 'p4' },
      ],
      trade,
      config: MATCHING_CONFIG,
      source: searching,
      upsert,
      dailyRemaining: 10,
    });
    expect(report.writeFailed).toBe(3);
    expect(report.failed).toBe(0);
    expect(report.processed).toBe(0);
    expect(report.stoppedByWriteFailures).toBe(true);
    // Le quatrième prospect n est même pas cherché chez Google.
    expect(searching.search).toHaveBeenCalledTimes(3);
  });

  it('constate le blocage même si la ligne blocked ne peut pas être écrite', async () => {
    // Le blocage est un fait constaté : il ne doit pas dépendre de la
    // réussite de sa persistance, sinon le CLI sort en 1 au lieu de 2.
    const upsert = vi.fn(async () => {
      throw new Error('réseau coupé');
    });
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
    expect(report.writeFailed).toBe(1);
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

describe('runEnrich, disjoncteur de recherches vides', () => {
  function prospects(count: number): EnrichProspect[] {
    return Array.from({ length: count }, (_, i) => ({ ...prospect, id: `p${i}` }));
  }

  it('arrete le run quand plus rien ne remonte de Google', async () => {
    // Signature d un selecteur casse : `search` rend un tableau vide sans
    // lever la moindre erreur. Sans disjoncteur, le run traitait les 40
    // prospects, ecrivait 40 « introuvables » faux et s annoncait reussi.
    const muet = { search: vi.fn(async () => [] as MapsCandidate[]) };
    const report = await runEnrich({
      prospects: prospects(40),
      trade,
      config: MATCHING_CONFIG,
      source: muet,
      upsert: vi.fn(async () => undefined),
      dailyRemaining: 100,
    });

    expect(report.stoppedByEmptySearches).toBe(true);
    expect(report.processed).toBe(15);
    expect(report.emptySearches).toBe(15);
    // Le run s arrete AVANT les 25 prospects restants : c est tout l interet.
    expect(report.processed).toBeLessThan(40);
  });

  it('ne se declenche pas sur des introuvables legitimes', async () => {
    // Ici Google repond parfaitement : des fiches remontent a chaque
    // recherche, elles ne correspondent simplement a personne. Le chemin de
    // lecture fonctionne, donc le soupcon ne doit jamais naitre — sinon un
    // metier reellement peu present sur Maps serait pris pour une panne.
    const horsSujet = {
      search: vi.fn(async () => [candidate({ name: 'Boulangerie Dupuis', category: 'Boulangerie' })]),
    };
    const report = await runEnrich({
      prospects: prospects(40),
      trade,
      config: MATCHING_CONFIG,
      source: horsSujet,
      upsert: vi.fn(async () => undefined),
      dailyRemaining: 100,
    });

    expect(report.notFound).toBe(40);
    expect(report.stoppedByEmptySearches).toBe(false);
    expect(report.emptySearches).toBe(0);
    expect(report.processed).toBe(40);
  });

  it('remet le compteur a zero des qu une fiche est lue', async () => {
    // Une seule lecture reussie prouve que les selecteurs tiennent : la serie
    // recommence a zero, sans quoi des absences eparpillees finiraient par
    // s additionner en fausse alerte au fil d un long run.
    let call = 0;
    const alterne = {
      search: vi.fn(async () => {
        call += 1;
        // Une reussite toutes les trente requetes. Ce prospect n a pas
        // d enseigne, il n emet donc que DEUX requetes — raison sociale puis
        // repli sur le metier — et une reussite tombe ainsi tous les quinze
        // prospects environ : juste sous le seuil, ce qui est exactement le
        // regime que ce test veut eprouver.
        return call % 30 === 0 ? [candidate()] : [];
      }),
    };
    const report = await runEnrich({
      prospects: prospects(40),
      trade,
      config: MATCHING_CONFIG,
      source: alterne,
      upsert: vi.fn(async () => undefined),
      dailyRemaining: 100,
    });

    // Le run va jusqu au bout : deux reussites, aux prospects 14 et 29, ont
    // suffi a couper deux series de quatorze vides qui, mises bout a bout,
    // auraient franchi le seuil.
    expect(report.stoppedByEmptySearches).toBe(false);
    expect(report.processed).toBe(40);
    expect(report.ok).toBe(2);
  });
});

describe('enrich — la trace que la calibration consommera', () => {
  function source(results: MapsCandidate[][]) {
    let call = 0;
    return {
      search: vi.fn(async () => results[call++] ?? []),
      close: vi.fn(async () => undefined),
    };
  }

  it('conserve les candidats même quand la fusion est automatique', () => {
    // « Ce cas fusionné était-il faux ? » est la première des trois questions
    // du jalon de calibration. Elle ne se pose pas si la ligne ne garde que
    // le gagnant : il faut voir face à quoi il a gagné.
    const row = buildEnrichmentRow(
      prospect,
      [candidate(), candidate({ placeId: 'zzz', name: 'Boulangerie Dupont', category: 'Boulangerie' })],
      trade,
      MATCHING_CONFIG,
    );
    expect(row.status).toBe('ok');
    expect(row.candidates).toHaveLength(2);
    expect(row.candidates.filter((c) => c.rejectedFor === null)).toHaveLength(1);
  });

  it('conserve les candidats écartés d un not_found, avec leur motif', () => {
    // « Un vrai candidat a-t-il été éliminé par la distance ? » — troisième
    // question du jalon, et la seule à laquelle la ligne ne répondait pas du
    // tout : l éliminé disparaissait avant d être écrit.
    const loin = candidate({ latitude: 47.26, longitude: -1.5601 });
    const row = buildEnrichmentRow(prospect, [loin], trade, MATCHING_CONFIG);
    expect(row.status).toBe('not_found');
    expect(row.candidates).toHaveLength(1);
    expect(row.candidates[0]?.rejectedFor).toBe('distance');
  });

  it('garde de quoi rejouer le calcul hors ligne', () => {
    // Coordonnées et catégorie ne servent pas à l affichage de la revue :
    // elles servent à recalculer distance et catégorie sous d autres seuils,
    // sans repasser par Google. Les omettre rendrait la trace inerte.
    const row = buildEnrichmentRow(prospect, [candidate()], trade, MATCHING_CONFIG);
    const stored = row.candidates[0];
    expect(stored?.latitude).toBe(47.2214);
    expect(stored?.longitude).toBe(-1.5602);
    expect(stored?.category).toBe('Plombier');
    expect(stored?.reviewCount).toBe(31);
  });

  it('réunit les candidats de toutes les requêtes jouées, sans doublon', async () => {
    // La première requête n a rien retenu, la seconde tranche. Sans réunion,
    // la fiche écartée par la première disparaîtrait — or c est précisément
    // une candidate à réexaminer quand on desserre un seuil.
    const written: EnrichmentRow[] = [];
    await runEnrich({
      prospects: [prospect],
      trade,
      config: MATCHING_CONFIG,
      source: source([
        [candidate({ placeId: 'ecarte', name: 'Boulangerie Dupont', category: 'Boulangerie' })],
        [candidate({ placeId: 'ecarte', name: 'Boulangerie Dupont', category: 'Boulangerie' }), candidate()],
      ]),
      upsert: async (row) => {
        written.push(row);
      },
      dailyRemaining: 10,
    });
    expect(written).toHaveLength(1);
    expect(written[0]?.candidates.map((c) => c.placeId).sort()).toEqual(['abc', 'ecarte']);
  });
});

describe('enrich — identité d une fiche vue deux fois', () => {
  function source(results: MapsCandidate[][]) {
    let call = 0;
    return {
      search: vi.fn(async () => results[call++] ?? []),
      close: vi.fn(async () => undefined),
    };
  }

  it('reconnaît la même fiche trouvée avec et sans identifiant de lieu', async () => {
    // Cas réel du lot de calibration : « Plombier Nantes RG Services » revient
    // par deux URL, celle de la carte de résultat (sans `!19s`, donc sans
    // placeId) et celle du panneau de fiche (avec). Une clé fondée d abord
    // sur le placeId les prend pour deux entreprises.
    //
    // L enjeu n est pas cosmétique : deux exemplaires RETENUS d une même
    // fiche font deux candidats au-dessus du seuil haut, et `selectMatch`
    // refuse alors de trancher. Le doublon empêcherait la fusion qu il
    // décrit.
    // La première requête ne retient rien — c est la condition pour que la
    // seconde parte, et donc pour que la même fiche soit vue deux fois.
    const doublon = { name: 'Boulangerie Dupont', category: 'Boulangerie' };
    const written: EnrichmentRow[] = [];
    await runEnrich({
      prospects: [prospect],
      trade,
      config: MATCHING_CONFIG,
      source: source([
        [
          candidate({
            ...doublon,
            placeId: null,
            mapsUrl: 'https://maps.google.com/place/@47.2214,-1.5602,17z',
          }),
        ],
        [
          candidate({
            ...doublon,
            placeId: 'ChIJdup',
            mapsUrl: 'https://maps.google.com/place/data=!19sChIJdup',
          }),
          candidate(),
        ],
      ]),
      upsert: async (row) => {
        written.push(row);
      },
      dailyRemaining: 10,
    });
    // La boulangerie une seule fois, plus le bon candidat : deux, pas trois.
    expect(written[0]?.candidates).toHaveLength(2);
    // On garde l exemplaire identifié : le placeId est ce qui rattache la
    // fiche à un lieu de façon stable.
    const boulangerie = written[0]?.candidates.find((c) => c.name === 'Boulangerie Dupont');
    expect(boulangerie?.placeId).toBe('ChIJdup');
  });

  it('ne confond pas deux entreprises distinctes à la même adresse', async () => {
    // Un immeuble abrite deux sociétés : même coordonnées, noms différents.
    // Les fondre perdrait un candidat réel.
    const written: EnrichmentRow[] = [];
    await runEnrich({
      prospects: [prospect],
      trade,
      config: MATCHING_CONFIG,
      source: source([
        [
          candidate({ placeId: null, name: 'Allard Plomberie' }),
          candidate({ placeId: null, name: 'Durand Chauffage' }),
        ],
      ]),
      upsert: async (row) => {
        written.push(row);
      },
      dailyRemaining: 10,
    });
    expect(written[0]?.candidates).toHaveLength(2);
  });
});
