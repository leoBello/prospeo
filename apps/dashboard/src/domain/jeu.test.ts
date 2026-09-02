import { describe, expect, it } from 'vitest';
import type { FaitInteraction, FaitMiseEnLigne, FaitPipeline } from './jeu.js';
import {
  PARAMETRES_PALIER,
  calculerBadges,
  calculerPalier,
  construireJeu,
  objectifDuJour,
  relancesTenues,
  rendezVousObtenus,
  serieDeJours,
} from './jeu.js';

// Horodatages en heure LOCALE, sans suffixe "Z" — même convention que
// `today.test.ts` et `deployment.test.ts` : `joursCivils` compare des
// composantes de calendrier locales, et un suffixe UTC ferait dépendre le
// résultat du fuseau de la machine qui exécute la suite.

/** Un événement de pipeline minimal, patché au besoin. */
function evenement(
  patch: Partial<FaitPipeline> & Pick<FaitPipeline, 'prospectId' | 'status'>,
): FaitPipeline {
  return {
    nextActionAt: null,
    origin: 'observe',
    occurredAt: '2026-08-01T08:00:00',
    ...patch,
  };
}

function interaction(prospectId: string, occurredAt: string): FaitInteraction {
  return { prospectId, occurredAt };
}

function miseEnLigne(prospectId: string, occurredAt: string): FaitMiseEnLigne {
  return { prospectId, occurredAt };
}

describe('relancesTenues', () => {
  it('compte tenue une interaction survenue LE JOUR MEME de l echeance', () => {
    const events = [
      evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-08-10', occurredAt: '2026-08-01T08:00:00' }),
    ];
    const interactions = [interaction('p1', '2026-08-10T23:00:00')];
    expect(relancesTenues(events, interactions)).toHaveLength(1);
  });

  it('compte tenue une interaction survenue LA VEILLE de l echeance', () => {
    const events = [
      evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-08-10', occurredAt: '2026-08-01T08:00:00' }),
    ];
    const interactions = [interaction('p1', '2026-08-09T10:00:00')];
    expect(relancesTenues(events, interactions)).toHaveLength(1);
  });

  it('ne compte PAS tenue une interaction survenue LE LENDEMAIN de l echeance', () => {
    const events = [
      evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-08-10', occurredAt: '2026-08-01T08:00:00' }),
    ];
    const interactions = [interaction('p1', '2026-08-11T00:30:00')];
    expect(relancesTenues(events, interactions)).toHaveLength(0);
  });

  it('compte en dates CIVILES : 23h59 tombe encore le jour de l echeance, 00h01 le lendemain deja', () => {
    // Deux minutes d'ecart en horloge, un jour civil d'ecart : une tranche de
    // 24h aurait traite les deux interactions de la meme facon.
    const events = [
      evenement({ prospectId: 'tard-mais-a-temps', status: 'relance', nextActionAt: '2026-08-10', occurredAt: '2026-08-01T08:00:00' }),
      evenement({ prospectId: 'tot-mais-trop-tard', status: 'relance', nextActionAt: '2026-08-10', occurredAt: '2026-08-01T08:00:00' }),
    ];
    const interactions = [
      interaction('tard-mais-a-temps', '2026-08-10T23:59:00'),
      interaction('tot-mais-trop-tard', '2026-08-11T00:01:00'),
    ];
    const tenues = relancesTenues(events, interactions);
    expect(tenues.map((t) => t.prospectId)).toEqual(['tard-mais-a-temps']);
  });

  it('ignore une ligne AMORCEE : elle ne dit rien d une echeance reellement en vigueur', () => {
    // C'est le point de doctrine central de la tache : l'amorcage reconstitue
    // un etat, il n'atteste d'aucun engagement pris a une date precise.
    const events = [
      evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-08-10', origin: 'amorcage', occurredAt: '2026-08-01T08:00:00' }),
    ];
    const interactions = [interaction('p1', '2026-08-10T09:00:00')];
    expect(relancesTenues(events, interactions)).toHaveLength(0);
  });

  it('ignore un evenement sans next_action_at : aucune echeance n existe a tenir', () => {
    const events = [evenement({ prospectId: 'p1', status: 'relance', nextActionAt: null })];
    const interactions = [interaction('p1', '2026-08-05T09:00:00')];
    expect(relancesTenues(events, interactions)).toHaveLength(0);
  });

  it('ignore une interaction anterieure a l evenement, qui ne peut repondre a une echeance pas encore posee', () => {
    const events = [
      evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-08-10', occurredAt: '2026-08-05T08:00:00' }),
    ];
    const interactions = [interaction('p1', '2026-08-01T08:00:00')];
    expect(relancesTenues(events, interactions)).toHaveLength(0);
  });

  it('ne croise jamais deux prospects differents', () => {
    const events = [
      evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-08-10', occurredAt: '2026-08-01T08:00:00' }),
    ];
    const interactions = [interaction('p2', '2026-08-10T09:00:00')];
    expect(relancesTenues(events, interactions)).toHaveLength(0);
  });

  it('ne compte qu une seule fois une interaction qui tient plusieurs echeances a la fois', () => {
    const events = [
      evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-08-10', occurredAt: '2026-08-01T08:00:00' }),
      evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-08-12', occurredAt: '2026-08-02T08:00:00' }),
    ];
    const interactions = [interaction('p1', '2026-08-09T09:00:00')];
    expect(relancesTenues(events, interactions)).toHaveLength(1);
  });
});

describe('rendezVousObtenus', () => {
  it('compte un changement de statut OBSERVE vers "interesse"', () => {
    const events = [evenement({ prospectId: 'p1', status: 'interesse', occurredAt: '2026-08-05T08:00:00' })];
    expect(rendezVousObtenus(events)).toHaveLength(1);
  });

  it('ignore un statut "interesse" issu d un AMORCAGE : ce n est pas un fait date observe', () => {
    const events = [
      evenement({ prospectId: 'p1', status: 'interesse', origin: 'amorcage', occurredAt: '2026-08-05T08:00:00' }),
    ];
    expect(rendezVousObtenus(events)).toHaveLength(0);
  });

  it('ignore un statut qui n est pas "interesse"', () => {
    const events = [evenement({ prospectId: 'p1', status: 'contacte', occurredAt: '2026-08-05T08:00:00' })];
    expect(rendezVousObtenus(events)).toHaveLength(0);
  });
});

describe('serieDeJours', () => {
  const MAINTENANT = new Date('2026-09-02T09:00:00');

  it('rend zero — un fait mesure — quand aucune relance n a jamais ete tenue', () => {
    expect(serieDeJours([], MAINTENANT)).toBe(0);
  });

  it('compte le jour meme quand une relance y a deja ete tenue', () => {
    const relances = relancesTenues(
      [evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-02', occurredAt: '2026-09-01T08:00:00' })],
      [interaction('p1', '2026-09-02T08:30:00')],
    );
    expect(serieDeJours(relances, MAINTENANT)).toBe(1);
  });

  it('ne casse pas la serie si aujourd hui n a encore rien : la journee n est pas terminee', () => {
    const relances = relancesTenues(
      [evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-01', occurredAt: '2026-08-25T08:00:00' })],
      [interaction('p1', '2026-09-01T08:30:00')],
    );
    expect(serieDeJours(relances, MAINTENANT)).toBe(1);
  });

  it('cumule des jours consecutifs', () => {
    const relances = relancesTenues(
      [
        evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-08-31', occurredAt: '2026-08-25T08:00:00' }),
        evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-01', occurredAt: '2026-08-25T08:00:00' }),
        evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-02', occurredAt: '2026-08-25T08:00:00' }),
      ],
      [
        interaction('p1', '2026-08-31T08:30:00'),
        interaction('p1', '2026-09-01T08:30:00'),
        interaction('p1', '2026-09-02T08:30:00'),
      ],
    );
    expect(serieDeJours(relances, MAINTENANT)).toBe(3);
  });

  it('s arrete au premier jour manquant, en remontant depuis aujourd hui', () => {
    // Relance tenue aujourd'hui et avant-hier, mais pas hier : le trou casse
    // la serie, qui ne vaut donc que 1 et non 2.
    const relances = relancesTenues(
      [
        evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-08-31', occurredAt: '2026-08-25T08:00:00' }),
        evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-02', occurredAt: '2026-08-25T08:00:00' }),
      ],
      [
        interaction('p1', '2026-08-31T08:30:00'),
        interaction('p1', '2026-09-02T08:30:00'),
      ],
    );
    expect(serieDeJours(relances, MAINTENANT)).toBe(1);
  });

  it('une base UNIQUEMENT amorcee ne produit jamais de serie presentee comme observee', () => {
    // Aucune ligne "observe" : `relancesTenues` rend un tableau vide, et la
    // serie qui en decoule est un vrai zero, pas une fabrication.
    const relances = relancesTenues(
      [
        evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-02', origin: 'amorcage', occurredAt: '2026-08-25T08:00:00' }),
      ],
      [interaction('p1', '2026-09-02T08:30:00')],
    );
    expect(serieDeJours(relances, MAINTENANT)).toBe(0);
  });
});

describe('objectifDuJour', () => {
  const MAINTENANT = new Date('2026-09-02T09:00:00');

  it('n est pas assez d historique le tout premier jour — la premiere observation date d aujourd hui', () => {
    // Le cas courant au jour de la livraison : aucun jour civil COMPLET ne
    // s'est encore ecoule depuis la premiere ligne observee.
    const events = [evenement({ prospectId: 'p1', status: 'relance', occurredAt: '2026-09-02T08:00:00' })];
    expect(objectifDuJour(events, [], MAINTENANT)).toEqual({ connue: false });
  });

  it('rend une vraie VALEUR ZERO quand l historique existe mais qu aucune relance n y a ete tenue', () => {
    // La distinction qui compte le plus : trois jours civils d'historique se
    // sont ecoules (contrairement au cas ci-dessus), et aucune relance n'y a
    // ete tenue. Ce zero est mesure, pas un manque de donnees.
    const events = [evenement({ prospectId: 'p1', status: 'relance', occurredAt: '2026-08-30T08:00:00' })];
    expect(objectifDuJour(events, [], MAINTENANT)).toEqual({ connue: true, valeur: 0 });
  });

  it('n est pas assez d historique en l absence totale d evenement de pipeline', () => {
    expect(objectifDuJour([], [], MAINTENANT)).toEqual({ connue: false });
  });

  it('une base UNIQUEMENT amorcee n est jamais assez d historique — l amorcage ne compte pas comme observation', () => {
    const events = [
      evenement({ prospectId: 'p1', status: 'relance', origin: 'amorcage', occurredAt: '2026-07-01T08:00:00' }),
    ];
    expect(objectifDuJour(events, [], MAINTENANT)).toEqual({ connue: false });
  });

  it('calcule la mediane sur les jours disponibles, meme moins de quatorze', () => {
    // Cinq jours civils complets d'historique (premiere observation le
    // 2026-08-28), avec un compte de relances tenues different chaque jour :
    // hier 1, avant-hier 2, il y a 3 jours 0, il y a 4 jours 4, il y a 5
    // jours 3. Trie : [0, 1, 2, 3, 4] -> mediane 2.
    const events = [evenement({ prospectId: 'p1', status: 'relance', occurredAt: '2026-08-28T08:00:00' })];
    const relances = [
      ...Array(1).fill(0).map(() => ({ prospectId: 'p1', occurredAt: '2026-09-01T10:00:00' })), // hier : 1
      ...Array(2).fill(0).map(() => ({ prospectId: 'p1', occurredAt: '2026-08-31T10:00:00' })), // avant-hier : 2
      // il y a 3 jours (2026-08-30) : 0, volontairement absent
      ...Array(4).fill(0).map(() => ({ prospectId: 'p1', occurredAt: '2026-08-29T10:00:00' })), // il y a 4 jours : 4
      ...Array(3).fill(0).map(() => ({ prospectId: 'p1', occurredAt: '2026-08-28T10:00:00' })), // il y a 5 jours : 3
    ];
    expect(objectifDuJour(events, relances, MAINTENANT)).toEqual({ connue: true, valeur: 2 });
  });

  it('plafonne la fenetre a quatorze jours : un historique plus ancien ne doit rien changer au resultat', () => {
    // Vingt jours d'historique, mais un enorme paquet de relances range hors
    // fenetre (il y a vingt jours) : s'il fuitait dans le calcul, la mediane
    // ne vaudrait plus zero.
    const events = [evenement({ prospectId: 'p1', status: 'relance', occurredAt: '2026-08-13T08:00:00' })];
    const horsFenetre = Array.from({ length: 50 }, () => ({
      prospectId: 'p1',
      occurredAt: '2026-08-13T10:00:00',
    }));
    expect(objectifDuJour(events, horsFenetre, MAINTENANT)).toEqual({ connue: true, valeur: 0 });
  });
});

describe('calculerPalier', () => {
  it('pese chaque source de points selon les parametres uniques du jeu', () => {
    const palier = calculerPalier(2, 1, 1);
    const attendu =
      2 * PARAMETRES_PALIER.points.relanceTenue +
      1 * PARAMETRES_PALIER.points.siteMisEnLigne +
      1 * PARAMETRES_PALIER.points.rendezVousObtenu;
    expect(palier.points).toBe(attendu);
  });

  it('rend zero point pour une base sans aucun fait observe', () => {
    const palier = calculerPalier(0, 0, 0);
    expect(palier.points).toBe(0);
    expect(palier.numero).toBe(1);
    expect(palier.progression).toBe(0);
  });

  it('fait franchir un palier une fois le seuil depasse', () => {
    // 3 rendez-vous a 200 points = 600 : un seuil de 500 est franchi une fois.
    const palier = calculerPalier(0, 0, 3);
    expect(palier.seuil).toBe(PARAMETRES_PALIER.seuil);
    expect(palier.numero).toBe(2);
    expect(palier.progression).toBe(600 - PARAMETRES_PALIER.seuil);
  });
});

describe('calculerBadges', () => {
  const AUCUN_JALON = { nombreRelancesTenues: 0, nombreSitesMisEnLigne: 0, nombreRendezVousObtenus: 0, serie: 0 };

  it('rend tous les badges VERROUILLES, mais visibles, quand aucun jalon n est atteint', () => {
    const badges = calculerBadges(AUCUN_JALON);
    expect(badges.length).toBeGreaterThan(0);
    expect(badges.every((b) => b.obtenu === false)).toBe(true);
  });

  it('debloque un badge precis sans debloquer les autres', () => {
    const badges = calculerBadges({ ...AUCUN_JALON, nombreSitesMisEnLigne: 1 });
    const parId = new Map(badges.map((b) => [b.id, b.obtenu]));
    expect(parId.get('premier_site_en_ligne')).toBe(true);
    expect(parId.get('premier_rendez_vous')).toBe(false);
    expect(parId.get('premiere_relance_tenue')).toBe(false);
  });
});

describe('construireJeu', () => {
  const MAINTENANT = new Date('2026-09-02T09:00:00');

  it('une base UNIQUEMENT amorcee ne produit jamais de serie ni de palier presentes comme observes', () => {
    // Le scenario du jour de livraison : `pipeline_event` vient d etre
    // amorcee depuis `prospect_pipeline.updated_at`, aucune observation reelle
    // n existe encore, et aucun site n a d evenement de mise en ligne.
    const jeu = construireJeu({
      maintenant: MAINTENANT,
      evenementsPipeline: [
        evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-05', origin: 'amorcage', occurredAt: '2026-08-20T10:00:00' }),
        evenement({ prospectId: 'p2', status: 'interesse', origin: 'amorcage', occurredAt: '2026-08-15T10:00:00' }),
      ],
      interactions: [],
      sitesMisEnLigne: [],
    });
    expect(jeu.serie).toBe(0);
    expect(jeu.objectifDuJour).toEqual({ connue: false });
    expect(jeu.palier.points).toBe(0);
    expect(jeu.badges.every((b) => b.obtenu === false)).toBe(true);
  });

  it('assemble des faits observes reels en un jeu coherent', () => {
    const jeu = construireJeu({
      maintenant: MAINTENANT,
      evenementsPipeline: [
        evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-02', occurredAt: '2026-08-15T10:00:00' }),
        evenement({ prospectId: 'p2', status: 'interesse', occurredAt: '2026-09-01T10:00:00' }),
      ],
      interactions: [interaction('p1', '2026-09-02T08:00:00')],
      sitesMisEnLigne: [miseEnLigne('p3', '2026-09-01T10:00:00')],
    });
    expect(jeu.serie).toBe(1);
    expect(jeu.palier.points).toBe(
      1 * PARAMETRES_PALIER.points.relanceTenue +
        1 * PARAMETRES_PALIER.points.siteMisEnLigne +
        1 * PARAMETRES_PALIER.points.rendezVousObtenu,
    );
    expect(jeu.badges.find((b) => b.id === 'premiere_relance_tenue')?.obtenu).toBe(true);
    expect(jeu.badges.find((b) => b.id === 'premier_site_en_ligne')?.obtenu).toBe(true);
    expect(jeu.badges.find((b) => b.id === 'premier_rendez_vous')?.obtenu).toBe(true);
  });
});
