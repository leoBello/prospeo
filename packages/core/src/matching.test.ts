import { describe, expect, it } from 'vitest';
import {
  haversineMeters,
  MATCHING_CONFIG,
  scoreCandidate,
  selectMatch,
  type MapsCandidate,
  type MatchSubject,
} from './matching.js';
import { getTrade } from './trades.js';

const plombier = getTrade('plombier');
if (plombier === undefined) throw new Error('métier plombier absent de la configuration');

const serrurier = getTrade('serrurier');
if (serrurier === undefined) throw new Error('métier serrurier absent de la configuration');

const subject: MatchSubject = {
  denomination: 'SARL ALLARD',
  denominationUsuelle: null,
  latitude: 47.2213,
  longitude: -1.5601,
};

function candidate(over: Partial<MapsCandidate> = {}): MapsCandidate {
  return {
    name: 'Allard Plomberie',
    address: '11 rue Auguste Brizeux, 44000 Nantes',
    latitude: 47.2214,
    longitude: -1.5602,
    category: 'Plombier',
    phone: '02 40 00 00 00',
    website: null,
    rating: 4.6,
    reviewCount: 31,
    placeId: 'abc',
    mapsUrl: 'https://maps.google.com/?cid=1',
    ...over,
  };
}

describe('haversineMeters', () => {
  it('vaut 0 pour un point sur lui-même', () => {
    expect(haversineMeters(47.2213, -1.5601, 47.2213, -1.5601)).toBe(0);
  });

  it('mesure une centaine de mètres entre deux points voisins', () => {
    const d = haversineMeters(47.2213, -1.5601, 47.2222, -1.5601);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });
});

describe('scoreCandidate', () => {
  it('note haut un candidat proche, homonyme et du bon métier', () => {
    const score = scoreCandidate(subject, candidate(), plombier, MATCHING_CONFIG);
    expect(score.confidence).toBeGreaterThan(MATCHING_CONFIG.highThreshold);
    expect(score.categoryMatch).toBe(true);
    expect(score.distanceM).toBeLessThan(50);
  });

  it('produit des lignes d explication lisibles', () => {
    const score = scoreCandidate(subject, candidate(), plombier, MATCHING_CONFIG);
    expect(score.lines.map((l) => l.code)).toEqual(['nom', 'distance', 'categorie']);
    expect(score.lines[0]?.label).toContain('nom');
  });

  it('rend une distance nulle et une contribution nulle sans coordonnées', () => {
    const score = scoreCandidate(
      { ...subject, latitude: null, longitude: null },
      candidate(),
      plombier,
      MATCHING_CONFIG,
    );
    expect(score.distanceM).toBeNull();
    expect(score.confidence).toBeLessThan(1);
  });

  it('ne confirme pas le métier serrurier via une catégorie « Dépannage électroménager »', () => {
    // « Dépannage » figure dans les mots-clés du serrurier — utile pour
    // retirer des jetons génériques d'un nom d'entreprise — mais c'est aussi
    // le mot de n'importe quel dépanneur d'électroménager, d'informatique ou
    // d'automobile. La cohérence de catégorie doit donc lire `categoryLabels`,
    // plus étroit, et refuser cette catégorie sans rapport avec la serrurerie.
    const score = scoreCandidate(
      {
        denomination: 'SARL MARTIN SERRURERIE',
        denominationUsuelle: null,
        latitude: 47.2213,
        longitude: -1.5601,
      },
      candidate({
        name: 'Martin Dépannage',
        category: 'Dépannage électroménager',
        latitude: 47.2213,
        longitude: -1.5601,
      }),
      serrurier,
      MATCHING_CONFIG,
    );
    expect(score.categoryMatch).toBe(false);
  });
});

describe('selectMatch', () => {
  it('fusionne automatiquement au-dessus du seuil haut', () => {
    const outcome = selectMatch(subject, [candidate()], plombier, MATCHING_CONFIG);
    expect(outcome.kind).toBe('ok');
  });

  it('élimine un candidat au-delà de la distance maximale', () => {
    // Même nom exact, mais à l autre bout de la ville : deux entreprises.
    const far = candidate({ latitude: 47.2600, longitude: -1.5601 });
    expect(selectMatch(subject, [far], plombier, MATCHING_CONFIG).kind).toBe('not_found');
  });

  it('renvoie not_found sans candidat', () => {
    expect(selectMatch(subject, [], plombier, MATCHING_CONFIG).kind).toBe('not_found');
  });

  it('renvoie ambiguous entre les deux seuils', () => {
    // Le bon nom, la bonne catégorie, mais à 200 m : confiance 0,833, sous le
    // seuil haut. C'est exactement le cas qu'un humain doit trancher — deux
    // établissements du même artisan, ou deux artisans homonymes du quartier ?
    const loin = candidate({ latitude: 47.2231, longitude: -1.5601 });
    const outcome = selectMatch(subject, [loin], plombier, MATCHING_CONFIG);
    expect(outcome.kind).toBe('ambiguous');
  });

  it('refuse de trancher quand deux candidats passent le seuil haut', () => {
    // La confiance élevée des deux est le symptôme du problème, pas sa
    // résolution : un faux appariement se paie au téléphone.
    const outcome = selectMatch(
      subject,
      [candidate(), candidate({ placeId: 'def', name: 'Allard Plomberie Nantes' })],
      plombier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('ambiguous');
    if (outcome.kind !== 'ambiguous') throw new Error('inattendu');
    expect(outcome.scored).toHaveLength(2);
  });

  it('classe les candidats ambigus du plus probable au moins probable', () => {
    // Deux candidats dans la bande ambiguë, à 200 m et 267 m : confiances
    // 0,833 et 0,778. Le plus proche doit sortir en tête.
    const outcome = selectMatch(
      subject,
      [
        candidate({ placeId: 'loin', latitude: 47.2237, longitude: -1.5601 }),
        candidate({ placeId: 'proche', latitude: 47.2231, longitude: -1.5601 }),
      ],
      plombier,
      MATCHING_CONFIG,
    );
    if (outcome.kind !== 'ambiguous') throw new Error('inattendu');
    expect(outcome.scored).toHaveLength(2);
    const [first, second] = outcome.scored;
    expect(first?.candidate.placeId).toBe('proche');
    expect(first?.score.confidence).toBeGreaterThanOrEqual(second?.score.confidence ?? 0);
  });

  it('ignore un candidat sous le seuil bas', () => {
    const outcome = selectMatch(
      subject,
      [candidate({ name: 'Boulangerie Dupont', category: 'Boulangerie' })],
      plombier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('not_found');
  });

  it('écarte un homonyme voisin dont le nom ne fait que prolonger le sien', () => {
    // « Allardin » prolonge « Allard » : la mesure jeton à jeton refuse la
    // paire, et la proximité seule ne suffit pas à franchir le seuil bas.
    const outcome = selectMatch(
      subject,
      [candidate({ name: 'Allardin Chauffage' })],
      plombier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('not_found');
  });

  it('ne fusionne pas automatiquement un serrurier avec un homonyme sans rapport', () => {
    // Constat critique de revue : « SARL MARTIN SERRURERIE » ne partage avec
    // « Martin Dépannage » qu'un patronyme banal, une fois le métier retiré
    // des deux côtés. Sans catégorie et à distance nulle, l'ancien calcul
    // atteignait exactement 0,8500 — le seuil de fusion automatique. Un faux
    // appariement ne se voit pas dans les statistiques : il se voit au
    // téléphone. Le cas doit revenir à un humain.
    const martinSubject: MatchSubject = {
      denomination: 'SARL MARTIN SERRURERIE',
      denominationUsuelle: null,
      latitude: 47.2213,
      longitude: -1.5601,
    };
    const outcome = selectMatch(
      martinSubject,
      [
        candidate({
          name: 'Martin Dépannage',
          category: null,
          latitude: 47.2213,
          longitude: -1.5601,
        }),
      ],
      serrurier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('ambiguous');
  });
});

describe('selectMatch — trace de ce qui a été examiné', () => {
  // Ces tests fixent ce dont la calibration des seuils a besoin. Sans eux,
  // `selectMatch` peut redevenir muet sur ses éliminations sans qu'aucun
  // test ne s'en aperçoive — et le prix de cette régression n'est pas une
  // erreur visible, c'est un run Google à refaire.

  it('conserve un candidat écarté par la distance, avec son motif', () => {
    const loin = candidate({ latitude: 47.26, longitude: -1.5601 });
    const outcome = selectMatch(subject, [loin], plombier, MATCHING_CONFIG);
    expect(outcome.kind).toBe('not_found');
    expect(outcome.scored).toHaveLength(1);
    expect(outcome.scored[0]?.rejectedFor).toBe('distance');
    // La distance mesurée reste lisible : c'est elle qu'on compare au seuil
    // quand on se demande si `maxDistanceM` est trop serré.
    expect(outcome.scored[0]?.score.distanceM).toBeGreaterThan(MATCHING_CONFIG.maxDistanceM);
  });

  it('conserve un candidat passé sous le seuil bas, avec son motif', () => {
    const outcome = selectMatch(
      subject,
      [candidate({ name: 'Boulangerie Dupont', category: 'Boulangerie' })],
      plombier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('not_found');
    expect(outcome.scored[0]?.rejectedFor).toBe('confiance');
  });

  it('expose aussi les candidats examinés quand il fusionne automatiquement', () => {
    // Le cas que la calibration doit pouvoir rejuger : la fusion était-elle
    // fausse, et un autre candidat méritait-il mieux ? Sans le second, la
    // question ne se pose même pas.
    const outcome = selectMatch(
      subject,
      [candidate(), candidate({ placeId: 'zzz', name: 'Boulangerie Dupont', category: 'Boulangerie' })],
      plombier,
      MATCHING_CONFIG,
    );
    expect(outcome.kind).toBe('ok');
    expect(outcome.scored).toHaveLength(2);
    expect(outcome.scored.filter((s) => s.rejectedFor === null)).toHaveLength(1);
  });

  it('classe tout le monde par confiance décroissante, éliminés compris', () => {
    const outcome = selectMatch(
      subject,
      [
        candidate({ placeId: 'hors-sujet', name: 'Boulangerie Dupont', category: 'Boulangerie' }),
        candidate({ placeId: 'bon' }),
      ],
      plombier,
      MATCHING_CONFIG,
    );
    const confidences = outcome.scored.map((s) => s.score.confidence);
    expect(confidences).toEqual([...confidences].sort((a, b) => b - a));
    expect(outcome.scored[0]?.candidate.placeId).toBe('bon');
  });

  it('ne marque aucun motif sur un candidat retenu', () => {
    const outcome = selectMatch(subject, [candidate()], plombier, MATCHING_CONFIG);
    expect(outcome.scored[0]?.rejectedFor).toBeNull();
  });
});
