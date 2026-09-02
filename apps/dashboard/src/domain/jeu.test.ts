import { describe, expect, it } from 'vitest';
import type { FaitInteraction, FaitPipeline } from './jeu.js';
import {
  FENETRE_OBJECTIF_JOURS,
  PARAMETRES_PALIER,
  calculerBadges,
  calculerPalier,
  construireJeu,
  objectifDuJour,
  relancesTenues,
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

describe('serieDeJours', () => {
  const MAINTENANT = new Date('2026-09-02T09:00:00');

  it('rend zero — un fait mesure — quand aucune relance n a jamais ete tenue', () => {
    expect(serieDeJours([], MAINTENANT, FENETRE_OBJECTIF_JOURS)).toEqual({ jours: 0, borneAtteinte: false });
  });

  it('compte le jour meme quand une relance y a deja ete tenue', () => {
    const relances = relancesTenues(
      [evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-02', occurredAt: '2026-09-01T08:00:00' })],
      [interaction('p1', '2026-09-02T08:30:00')],
    );
    expect(serieDeJours(relances, MAINTENANT, FENETRE_OBJECTIF_JOURS)).toEqual({ jours: 1, borneAtteinte: false });
  });

  it('ne casse pas la serie si aujourd hui n a encore rien : la journee n est pas terminee', () => {
    const relances = relancesTenues(
      [evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-01', occurredAt: '2026-08-25T08:00:00' })],
      [interaction('p1', '2026-09-01T08:30:00')],
    );
    expect(serieDeJours(relances, MAINTENANT, FENETRE_OBJECTIF_JOURS)).toEqual({ jours: 1, borneAtteinte: false });
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
    expect(serieDeJours(relances, MAINTENANT, FENETRE_OBJECTIF_JOURS)).toEqual({ jours: 3, borneAtteinte: false });
  });

  it('s arrete au premier jour manquant, en remontant depuis aujourd hui', () => {
    // Relance tenue aujourd'hui et avant-hier, mais pas hier : le trou casse
    // la serie, qui ne vaut donc que 1 et non 2 — et c'est un compte EXACT,
    // pas un plancher, puisqu'un vrai trou a ete observe avant le bord de la
    // fenetre.
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
    expect(serieDeJours(relances, MAINTENANT, FENETRE_OBJECTIF_JOURS)).toEqual({ jours: 1, borneAtteinte: false });
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
    expect(serieDeJours(relances, MAINTENANT, FENETRE_OBJECTIF_JOURS)).toEqual({ jours: 0, borneAtteinte: false });
  });

  it('nomme la borne plutot que de la taire quand la serie remplit toute la fenetre fournie', () => {
    // Fenetre volontairement etroite (3 jours) pour ecrire un test lisible :
    // trois relances consecutives, aucun trou observe — impossible de savoir
    // si la serie s'arrete la ou continue plus loin, faute de donnee au-dela.
    const relances = [
      { prospectId: 'p1', occurredAt: '2026-09-02T08:00:00' },
      { prospectId: 'p1', occurredAt: '2026-09-01T08:00:00' },
      { prospectId: 'p1', occurredAt: '2026-08-31T08:00:00' },
    ];
    expect(serieDeJours(relances, MAINTENANT, 3)).toEqual({ jours: 3, borneAtteinte: true });
  });

  it('ne pretend pas la borne atteinte quand un vrai trou arrete le compte avant elle', () => {
    // Meme fenetre de 3 jours, mais un trou hier : le compte s'arrete a 1,
    // et c'est un fait EXACT — la fenetre n'a rien a voir avec cet arret.
    const relances = [{ prospectId: 'p1', occurredAt: '2026-09-02T08:00:00' }];
    expect(serieDeJours(relances, MAINTENANT, 3)).toEqual({ jours: 1, borneAtteinte: false });
  });
});

describe('objectifDuJour', () => {
  const MAINTENANT = new Date('2026-09-02T09:00:00');

  it('n est pas assez d historique le tout premier jour — la premiere observation date d aujourd hui', () => {
    // Le cas courant au jour de la livraison : aucun jour civil COMPLET ne
    // s'est encore ecoule depuis la premiere ligne observee, et rien
    // n'existe non plus au-dela de la fenetre lue.
    const events = [evenement({ prospectId: 'p1', status: 'relance', occurredAt: '2026-09-02T08:00:00' })];
    expect(objectifDuJour(events, [], MAINTENANT, false)).toEqual({
      connue: false,
      motif: 'historique_insuffisant',
    });
  });

  it('rend le motif MEDIANE NULLE — pas insuffisant — quand l historique est suffisant mais qu aucune relance n y a ete tenue', () => {
    // Le coeur du correctif : trois jours civils d'historique se sont ecoules
    // (contrairement au cas ci-dessus), et aucune relance n'y a ete tenue —
    // la mediane vaut zero, mais ce n'est PAS un manque de donnees. Rendre le
    // meme motif que le test precedent confondrait deux absences de nature
    // differente (voir le docstring de `MotifObjectifInconnu`).
    const events = [evenement({ prospectId: 'p1', status: 'relance', occurredAt: '2026-08-30T08:00:00' })];
    expect(objectifDuJour(events, [], MAINTENANT, false)).toEqual({ connue: false, motif: 'mediane_nulle' });
  });

  it('n est pas assez d historique en l absence totale d evenement de pipeline', () => {
    expect(objectifDuJour([], [], MAINTENANT, false)).toEqual({
      connue: false,
      motif: 'historique_insuffisant',
    });
  });

  it('une base UNIQUEMENT amorcee n est jamais assez d historique — l amorcage ne compte pas comme observation', () => {
    const events = [
      evenement({ prospectId: 'p1', status: 'relance', origin: 'amorcage', occurredAt: '2026-07-01T08:00:00' }),
    ];
    expect(objectifDuJour(events, [], MAINTENANT, false)).toEqual({
      connue: false,
      motif: 'historique_insuffisant',
    });
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
    expect(objectifDuJour(events, relances, MAINTENANT, false)).toEqual({ connue: true, valeur: 2 });
  });

  it('plafonne la fenetre a quatorze jours quand la fenetre lue le confirme deja, et rend MEDIANE NULLE (pas insuffisant)', () => {
    // Vingt jours d'historique reel, mais la fenetre lue (14 jours) ne montre
    // aucune ligne "observe" — data/jeu.ts l'a etabli par un `count` separe
    // (`historiqueAuDelaDeLaFenetre: true`). Un enorme paquet de relances
    // range hors fenetre : s'il fuitait dans le calcul, la mediane ne
    // vaudrait plus zero. L'historique est ici suffisant (quatorze jours
    // pleins confirmes) : le zero qui en resulte est une mesure, pas un
    // manque — motif `mediane_nulle`, jamais `historique_insuffisant`.
    const horsFenetre = Array.from({ length: 50 }, () => ({
      prospectId: 'p1',
      occurredAt: '2026-08-13T10:00:00',
    }));
    expect(objectifDuJour([], horsFenetre, MAINTENANT, true)).toEqual({ connue: false, motif: 'mediane_nulle' });
  });

  it('sans le drapeau, un historique absent de la fenetre lue reste INSUFFISANT, meme avec des relances hors fenetre', () => {
    // Meme jeu de relances que le test precedent, mais SANS la confirmation
    // serveur qu'il existe de l'historique au-dela : rien ne permet de dire
    // qu'un seul jour civil complet s'est ecoule — motif
    // `historique_insuffisant`, distinct du test precedent bien que les deux
    // rendent `connue: false`.
    const horsFenetre = Array.from({ length: 50 }, () => ({
      prospectId: 'p1',
      occurredAt: '2026-08-13T10:00:00',
    }));
    expect(objectifDuJour([], horsFenetre, MAINTENANT, false)).toEqual({
      connue: false,
      motif: 'historique_insuffisant',
    });
  });
});

describe('calculerPalier', () => {
  it('pese chaque source de points selon les parametres uniques du jeu', () => {
    const palier = calculerPalier({ connue: true, valeur: 2 }, 1, 1);
    const attendu =
      2 * PARAMETRES_PALIER.points.relanceTenue +
      1 * PARAMETRES_PALIER.points.siteMisEnLigne +
      1 * PARAMETRES_PALIER.points.rendezVousObtenu;
    expect(palier.points).toBe(attendu);
  });

  it('rend zero point pour une base sans aucun fait observe', () => {
    const palier = calculerPalier({ connue: true, valeur: 0 }, 0, 0);
    expect(palier.points).toBe(0);
    expect(palier.numero).toBe(1);
    expect(palier.progression).toBe(0);
  });

  it('fait franchir un palier une fois le seuil depasse', () => {
    // 3 rendez-vous a 200 points = 600 : un seuil de 500 est franchi une fois.
    const palier = calculerPalier({ connue: true, valeur: 0 }, 0, 3);
    expect(palier.seuil).toBe(PARAMETRES_PALIER.seuil);
    expect(palier.numero).toBe(2);
    expect(palier.progression).toBe(600 - PARAMETRES_PALIER.seuil);
  });

  it('ne fait contribuer aucun point pour les relances tenues tant que le cumul n est pas mesurable', () => {
    // Le coeur du correctif de revue : `{connue: false}` (faute de source
    // honnete pour un cumul depuis toujours, croisant deux tables) ne doit
    // JAMAIS se lire comme un zero mesure — mais ne doit pas non plus faire
    // regresser ou fabriquer un total. Sa seule consequence licite est de ne
    // rien ajouter, pas plus, pas moins.
    const palier = calculerPalier({ connue: false }, 1, 1);
    expect(palier.points).toBe(
      1 * PARAMETRES_PALIER.points.siteMisEnLigne + 1 * PARAMETRES_PALIER.points.rendezVousObtenu,
    );
  });

  it('complet vaut vrai quand le cumul de relances tenues est mesurable', () => {
    expect(calculerPalier({ connue: true, valeur: 0 }, 0, 0).complet).toBe(true);
  });

  it('complet vaut faux quand le cumul de relances tenues ne l est pas — points est alors un plancher', () => {
    // Second correctif de revue : l'incompletude doit rester lisible depuis
    // `Jeu`, pas seulement absorbee en silence dans `points`.
    expect(calculerPalier({ connue: false }, 1, 1).complet).toBe(false);
  });
});

describe('calculerBadges', () => {
  const AUCUN_JALON = {
    relancesTenuesCumulees: { connue: false as const },
    nombreSitesMisEnLigne: 0,
    nombreRendezVousObtenus: 0,
    serie: { jours: 0, borneAtteinte: false },
  };

  it('rend premiere_relance_tenue NON MESURABLE (pas verrouille) quand aucun cumul honnete n existe', () => {
    // Second correctif de revue : ce badge n'est debloquable par AUCUN geste
    // de l'operateur aujourd'hui — le confondre avec "verrouille" laisserait
    // croire le contraire.
    const badges = calculerBadges(AUCUN_JALON);
    expect(badges.find((b) => b.id === 'premiere_relance_tenue')?.etat).toBe('non_mesurable');
  });

  it('rend les trois autres badges VERROUILLES (pas non_mesurable), visibles, quand aucun jalon n est atteint', () => {
    const badges = calculerBadges(AUCUN_JALON);
    const parId = new Map(badges.map((b) => [b.id, b.etat]));
    expect(parId.get('premier_site_en_ligne')).toBe('verrouille');
    expect(parId.get('premier_rendez_vous')).toBe('verrouille');
    expect(parId.get('serie_sept_jours')).toBe('verrouille');
  });

  it('debloque un badge precis sans debloquer les autres', () => {
    const badges = calculerBadges({ ...AUCUN_JALON, nombreSitesMisEnLigne: 1 });
    const parId = new Map(badges.map((b) => [b.id, b.etat]));
    expect(parId.get('premier_site_en_ligne')).toBe('obtenu');
    expect(parId.get('premier_rendez_vous')).toBe('verrouille');
    expect(parId.get('premiere_relance_tenue')).toBe('non_mesurable');
  });

  it('ne debloque jamais premiere_relance_tenue quand le cumul n est pas mesurable, meme a une valeur qui semblerait suffisante', () => {
    // Un pur garde-fou de type : `connue: false` ne porte aucune `valeur`,
    // impossible de le confondre avec un `valeur: 1` qui debloquerait le
    // badge.
    const badges = calculerBadges(AUCUN_JALON);
    expect(badges.find((b) => b.id === 'premiere_relance_tenue')?.etat).not.toBe('obtenu');
  });

  it('debloque premiere_relance_tenue (obtenu, pas seulement mesurable) quand le cumul atteint au moins un', () => {
    const badges = calculerBadges({ ...AUCUN_JALON, relancesTenuesCumulees: { connue: true, valeur: 1 } });
    expect(badges.find((b) => b.id === 'premiere_relance_tenue')?.etat).toBe('obtenu');
  });

  it('rend premiere_relance_tenue VERROUILLE (pas non_mesurable) quand le cumul est mesurable mais nul', () => {
    // La troisieme valeur possible du triplet : mesurable, mais pas encore atteint.
    const badges = calculerBadges({ ...AUCUN_JALON, relancesTenuesCumulees: { connue: true, valeur: 0 } });
    expect(badges.find((b) => b.id === 'premiere_relance_tenue')?.etat).toBe('verrouille');
  });

  it('debloque le badge de serie des sept jours, meme si le compte n est qu un plancher', () => {
    // `borneAtteinte: true` : la vraie serie est AU MOINS 14 jours, donc
    // forcement au moins 7 — la comparaison reste valide malgre l'incertitude.
    const badges = calculerBadges({ ...AUCUN_JALON, serie: { jours: 14, borneAtteinte: true } });
    expect(badges.find((b) => b.id === 'serie_sept_jours')?.etat).toBe('obtenu');
  });
});

describe('realiseAujourdHui (via construireJeu) — le numerateur de l anneau', () => {
  const MAINTENANT = new Date('2026-09-02T09:00:00');

  function jeuAvecRelances(interactions: FaitInteraction[]) {
    return construireJeu({
      maintenant: MAINTENANT,
      // Echeance posee le 20 aout, due le 5 septembre : large marge pour que
      // chaque interaction testee (hier, aujourd hui, demain) tombe bien DANS
      // la fenetre [pose, due] que `relancesTenues` exige pour la compter —
      // seul le decalage en jours jusqu'a `maintenant` doit faire varier
      // `realiseAujourdHui` d'un test a l'autre, pas la reconnaissance de la
      // relance elle-meme.
      evenementsPipeline: [
        evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-05', occurredAt: '2026-08-20T10:00:00' }),
      ],
      interactions,
      historiqueAuDelaDeLaFenetre: false,
      relancesTenuesCumulees: { connue: false },
      nombreSitesMisEnLigne: 0,
      nombreRendezVousObtenus: 0,
    });
  }

  it('compte une relance tenue survenue aujourd hui', () => {
    const jeu = jeuAvecRelances([interaction('p1', '2026-09-02T08:30:00')]);
    expect(jeu.realiseAujourdHui).toBe(1);
  });

  it('ne compte pas une relance tenue survenue hier', () => {
    const jeu = jeuAvecRelances([interaction('p1', '2026-09-01T08:30:00')]);
    expect(jeu.realiseAujourdHui).toBe(0);
  });

  it('ne compte pas une relance dont l interaction est datee de demain', () => {
    const jeu = jeuAvecRelances([interaction('p1', '2026-09-03T08:30:00')]);
    expect(jeu.realiseAujourdHui).toBe(0);
  });

  it('cumule plusieurs relances tenues le meme jour, et ignore celles des autres jours', () => {
    const jeu = jeuAvecRelances([
      interaction('p1', '2026-09-02T07:00:00'),
      interaction('p1', '2026-09-02T18:00:00'),
      interaction('p1', '2026-09-01T07:00:00'),
    ]);
    expect(jeu.realiseAujourdHui).toBe(2);
  });

  it('rend zero — un fait mesure — quand aucune relance n a ete tenue aujourd hui', () => {
    const jeu = jeuAvecRelances([]);
    expect(jeu.realiseAujourdHui).toBe(0);
  });
});

describe('construireJeu', () => {
  const MAINTENANT = new Date('2026-09-02T09:00:00');

  it('une base UNIQUEMENT amorcee ne produit jamais de serie ni de palier presentes comme observes', () => {
    // Le scenario du jour de livraison : `pipeline_event` vient d etre
    // amorcee depuis `prospect_pipeline.updated_at`, aucune observation reelle
    // n existe encore, et aucun site ni rendez-vous ne remonte des comptes
    // serveur.
    const jeu = construireJeu({
      maintenant: MAINTENANT,
      evenementsPipeline: [
        evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-05', origin: 'amorcage', occurredAt: '2026-08-20T10:00:00' }),
        evenement({ prospectId: 'p2', status: 'interesse', origin: 'amorcage', occurredAt: '2026-08-15T10:00:00' }),
      ],
      interactions: [],
      historiqueAuDelaDeLaFenetre: false,
      relancesTenuesCumulees: { connue: false },
      nombreSitesMisEnLigne: 0,
      nombreRendezVousObtenus: 0,
    });
    expect(jeu.serie).toEqual({ jours: 0, borneAtteinte: false });
    expect(jeu.objectifDuJour).toEqual({ connue: false, motif: 'historique_insuffisant' });
    expect(jeu.realiseAujourdHui).toBe(0);
    expect(jeu.palier.points).toBe(0);
    expect(jeu.palier.complet).toBe(false);
    expect(jeu.badges.every((b) => b.etat !== 'obtenu')).toBe(true);
  });

  it('assemble des faits observes reels en un jeu coherent', () => {
    const jeu = construireJeu({
      maintenant: MAINTENANT,
      evenementsPipeline: [
        evenement({ prospectId: 'p1', status: 'relance', nextActionAt: '2026-09-02', occurredAt: '2026-08-20T10:00:00' }),
        evenement({ prospectId: 'p2', status: 'interesse', occurredAt: '2026-09-01T10:00:00' }),
      ],
      interactions: [interaction('p1', '2026-09-02T08:00:00')],
      historiqueAuDelaDeLaFenetre: false,
      // Voir le docstring de `calculerPalier` : sans source honnete pour un
      // cumul de relances tenues depuis toujours, ce champ reste `{connue:
      // false}` MEME quand une relance a bel et bien ete tenue dans la
      // fenetre (elle nourrit `serie`/`objectifDuJour` ci-dessous, pas le
      // palier).
      relancesTenuesCumulees: { connue: false },
      nombreSitesMisEnLigne: 1,
      nombreRendezVousObtenus: 1,
    });
    expect(jeu.serie).toEqual({ jours: 1, borneAtteinte: false });
    expect(jeu.palier.points).toBe(
      1 * PARAMETRES_PALIER.points.siteMisEnLigne + 1 * PARAMETRES_PALIER.points.rendezVousObtenu,
    );
    // Le palier omet la part "relance tenue" (voir ci-dessus) : `complet`
    // doit le dire, pas seulement le calcul silencieux de `points`.
    expect(jeu.palier.complet).toBe(false);
    expect(jeu.badges.find((b) => b.id === 'premiere_relance_tenue')?.etat).toBe('non_mesurable');
    expect(jeu.badges.find((b) => b.id === 'premier_site_en_ligne')?.etat).toBe('obtenu');
    expect(jeu.badges.find((b) => b.id === 'premier_rendez_vous')?.etat).toBe('obtenu');
  });
});
