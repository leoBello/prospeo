import { describe, expect, it } from 'vitest';
import {
  bestNameMatch,
  jaroWinkler,
  nameVariants,
  significantTokens,
  tokenContainment,
} from './name-match.js';
import { getTrade } from './trades.js';

describe('jaroWinkler', () => {
  it('vaut 1 pour deux chaînes identiques', () => {
    expect(jaroWinkler('martin', 'martin')).toBe(1);
  });

  it('vaut 0 pour deux chaînes sans lettre commune', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
  });

  it('récompense un préfixe commun', () => {
    expect(jaroWinkler('h20', 'h2o')).toBeGreaterThan(0.8);
  });

  it('traite la chaîne vide sans exploser', () => {
    expect(jaroWinkler('', 'martin')).toBe(0);
    expect(jaroWinkler('', '')).toBe(1);
  });
});

describe('significantTokens', () => {
  it('retire les jetons génériques du métier', () => {
    expect(significantTokens('plomberie martin', ['plomberie'])).toEqual(['martin']);
  });

  it('retire les jetons trop courts pour identifier', () => {
    expect(significantTokens('ets du martin', [])).toEqual(['martin']);
  });

  it('ne renvoie rien quand tout est générique', () => {
    expect(significantTokens('plomberie chauffage', ['plomberie', 'chauffage'])).toEqual([]);
  });
});

describe('tokenContainment', () => {
  it('vaut 1 quand tous les jetons significatifs sont présents', () => {
    expect(
      tokenContainment('martin dupont', 'plomberie martin dupont fils', ['plomberie']),
    ).toBe(1);
  });

  it('vaut 0 sans jeton significatif commun', () => {
    expect(tokenContainment('escapin', 'plomberie martin', ['plomberie'])).toBe(0);
  });

  it('vaut 0 quand la source n a aucun jeton significatif', () => {
    // « Plomberie » face à « SOS Plomberie » ne doit pas valoir 1 : sinon
    // deux entreprises sans rapport s apparient sur un mot de métier.
    expect(tokenContainment('plomberie', 'sos plomberie', ['plomberie'])).toBe(0);
  });

  it('normalise b comme a : la casse ne doit pas casser la comparaison', () => {
    expect(
      tokenContainment('MARTIN DUPONT', 'plomberie MARTIN DUPONT fils', ['plomberie']),
    ).toBe(1);
  });

  it('plafonne à 0,80 sur un seul jeton, mais rend toujours 1 sur deux jetons présents', () => {
    // Un patronyme seul n'est pas une identité : « Martin » retrouvé dans
    // « Plomberie Martin Fils » ne doit pas valoir 1, sous peine de fusionner
    // deux entreprises que seul un nom de famille banal réunit. Dès que deux
    // jetons significatifs distinguent le nom, le comportement ne change pas.
    expect(tokenContainment('martin', 'plomberie martin fils', ['plomberie'])).toBe(0.8);
    expect(
      tokenContainment('martin dupont', 'plomberie martin dupont fils', ['plomberie']),
    ).toBe(1);
  });
});

describe('nameVariants', () => {
  it('sépare la dénomination de ses parenthèses', () => {
    expect(nameVariants('GHAITH RAHALI (RGSERVICES)', 'RGSERVICES')).toEqual(
      expect.arrayContaining(['ghaith rahali', 'rgservices']),
    );
  });

  it('découpe les segments séparés par une barre oblique', () => {
    const variants = nameVariants(
      'PHILIPPE DELAITRE (POPO LES BONS TUYAUX / PHILIPPE DELAITRE)',
      'POPO LES BONS TUYAUX / PHILIPPE DELAITRE',
    );
    expect(variants).toEqual(expect.arrayContaining(['popo les bons tuyaux', 'philippe delaitre']));
  });

  it('retient la dénomination usuelle même sans rapport avec la légale', () => {
    expect(nameVariants('ERIC ESCAPIN', 'H20')).toEqual(
      expect.arrayContaining(['eric escapin', 'h20']),
    );
  });

  it('ne renvoie ni doublon ni chaîne vide', () => {
    const variants = nameVariants('SARL ALLARD (ALLARD)', 'ALLARD');
    expect(variants).toEqual([...new Set(variants)]);
    expect(variants).not.toContain('');
  });
});

describe('bestNameMatch — les cas réels de la base', () => {
  const generic = ['plomberie', 'plombier', 'chauffage', 'depannage'];

  it('rattrape « ERIC ESCAPIN » via sa dénomination usuelle « H20 »', () => {
    const match = bestNameMatch(nameVariants('ERIC ESCAPIN', 'H20'), 'H2O Plomberie', generic);
    expect(match.score).toBeGreaterThan(0.8);
    expect(match.variant).toBe('h20');
  });

  it('rattrape « RGSERVICES » face à « RG Services » malgré l espace', () => {
    const match = bestNameMatch(
      nameVariants('GHAITH RAHALI (RGSERVICES)', 'RGSERVICES'),
      'RG Services',
      generic,
    );
    expect(match.score).toBeGreaterThan(0.9);
  });

  it('rattrape un patronyme noyé dans un nom commercial, plafonné à 0,80', () => {
    // « SARL ALLARD » ne comporte, une fois le métier retiré, qu'un seul
    // jeton significatif — « allard » — donc le plafond du jeton unique
    // s'applique : 0,80, et non plus 1,00 comme avant le correctif de revue.
    // C'est la mesure jeton à jeton qui l'emporte ici, faute d'un jeu de
    // longueurs comparables pour la comparaison de chaînes entières.
    const match = bestNameMatch(nameVariants('SARL ALLARD', null), 'Allard Plomberie', generic);
    expect(match.score).toBe(0.8);
  });

  it('ne rapproche pas deux entreprises que seul le métier réunit', () => {
    const match = bestNameMatch(nameVariants('SARL ALLARD', null), 'Plomberie Dupont', generic);
    expect(match.score).toBeLessThan(0.55);
  });

  it('ne confond pas deux patronymes dont l un prolonge l autre', () => {
    // jaroWinkler('martin', 'martinez') vaut 0.95 : sans contrainte de
    // longueur, bestTokenScore ferait de deux plombiers voisins nommés
    // Martin et Martinez un faux appariement au-dessus du seuil de fusion.
    const match = bestNameMatch(nameVariants('SARL MARTIN', null), 'MARTINEZ Plomberie', generic);
    expect(match.score).toBeLessThan(0.55);
  });

  it('renvoie un score nul sans variante', () => {
    expect(bestNameMatch([], 'Plomberie Dupont', generic)).toEqual({ score: 0, variant: null });
  });
});

describe('bestNameMatch — ce que le lot de calibration a mis au jour', () => {
  const generic = ['plomberie', 'plombier', 'chauffage', 'depannage'];

  it('ne tire aucun score du métier partagé par les deux noms', () => {
    // Mesuré sur le lot : « lallemand plomberie » ~ « adorenov plomberie »
    // valait 0,755, contre 0,569 entre les seuls noms. Le mot de métier
    // apportait 0,19 de ressemblance à deux entreprises que rien ne relie —
    // et c est lui qui peuplait la file de LALLEMAND de huit « … PLOMBERIE ».
    //
    // L invariant est plus fort qu un seuil : le métier ne doit RIEN
    // apporter, donc le score doit être le même avec et sans lui.
    const avec = bestNameMatch(
      nameVariants('EURL LALLEMAND-PLOMBERIE', null),
      'ADORÉNOV PLOMBERIE',
      generic,
    );
    const sans = bestNameMatch(nameVariants('EURL LALLEMAND', null), 'ADORÉNOV', generic);
    expect(avec.score).toBeCloseTo(sans.score, 10);
    expect(avec.score).toBeLessThan(0.65);
  });

  it('n apparie pas un sigle de trois lettres sur son seul préfixe', () => {
    // Mesuré : « epb » ~ « epsi » = 0,778 et « epb » ~ « epa » = 0,822,
    // quand « epb » ~ « ebp » — le MÊME sigle transposé — ne vaut que 0,600.
    // Le score mesurait le préfixe partagé, pas l identité. EPB retenait
    // « C est le Plombier ».
    const variants = nameVariants('EPB', null);
    for (const fiche of ['EPSI - Ecole d ingénierie informatique', 'EDBS Nantes', 'beople']) {
      expect(bestNameMatch(variants, fiche, generic).score).toBeLessThan(0.3);
    }
  });

  it('rattrape encore « H20 » face à « H2O », qui est le même nom transcrit', () => {
    // La contrainte de longueur minimale ne doit pas emporter ce cas : trois
    // lettres, mais les mêmes exactement, à l ordre près. C est une variante
    // d écriture, pas une ressemblance de préfixe.
    const match = bestNameMatch(nameVariants('ERIC ESCAPIN', 'H20'), 'H2O Plomberie', generic);
    expect(match.score).toBeGreaterThan(0.8);
    expect(match.variant).toBe('h20');
  });

  it('rattrape « RGSERVICES » dans un nom Maps qui porte des mots en plus', () => {
    // Le test existant éprouvait « RG Services » seul. La vraie fiche
    // s appelle « Plombier Nantes RG Services », et le chemin sans espaces
    // était alors annulé par le garde-fou de ratio de longueur (0,417 < 0,50).
    // Résultat mesuré : 0 sur ce chemin, et le meilleur score retombait sur
    // « ghaith rahali » à 0,56 — exactement le score obtenu face au CCAS de
    // Nantes. L appariement ne distinguait pas le bon candidat d un centre
    // d action sociale.
    const match = bestNameMatch(
      nameVariants('GHAITH RAHALI (RGSERVICES)', 'RGSERVICES'),
      'Plombier Nantes RG Services',
      generic,
    );
    expect(match.variant).toBe('rgservices');
    expect(match.score).toBeGreaterThan(0.75);
  });

  it('ne prend pas un nom prolongé pour un nom contenu', () => {
    // L inclusion sans espaces ne doit pas rouvrir la porte que la contrainte
    // de longueur ferme : « martin » est bien contenu dans « martinez », mais
    // il s y termine en plein milieu d un mot. Une agglutination légitime
    // commence et finit sur une frontière de jeton — « rgservices » couvre
    // « rg » + « services » entiers.
    const match = bestNameMatch(nameVariants('SARL MARTIN', null), 'MARTINEZ Plomberie', generic);
    expect(match.score).toBeLessThan(0.55);
  });

  it('ne relève pas un patronyme unique au-dessus de son plafond par l inclusion', () => {
    // « martin » est contenu jeton pour jeton dans « martin dupont », donc
    // l inclusion vaudrait 1,00 et contournerait le plafond du jeton unique
    // par la porte à côté. Le plafond doit tenir : un patronyme n est pas
    // une identité, quel que soit le chemin qui le mesure.
    const match = bestNameMatch(nameVariants('SARL MARTIN', null), 'Martin Dupont', generic);
    expect(match.score).toBeLessThanOrEqual(0.8);
  });
});

describe('bestNameMatch — identité complète contre patronyme noyé', () => {
  const generic = ['plomberie', 'plombier', 'chauffage', 'depannage'];

  it('rend 1 quand les deux noms sont le même nom, en entier', () => {
    // Cas réel du lot : « IDEAL » face à la fiche « Ideal ». Le plafond du
    // jeton unique existe pour refuser qu un patronyme SEUL emporte la
    // décision quand le candidat porte, lui, une identité en plus — « Martin »
    // face à « Martin Dépannage ». Ici il n y a pas d identité en plus : les
    // deux noms sont le même, rien n a été retiré d un côté pour les faire
    // coïncider. Les plafonner reviendrait à punir la correspondance parfaite.
    const match = bestNameMatch(nameVariants('IDEAL', null), 'Ideal', generic);
    expect(match.score).toBe(1);
  });

  it('continue de plafonner un patronyme que le candidat complète', () => {
    // Le garde-fou du cas précédent : « martin » et « martin depannage » ne
    // sont PAS le même nom, même une fois le métier retiré — le candidat
    // porte un mot que la variante n a pas.
    const match = bestNameMatch(nameVariants('SARL MARTIN', null), 'Martin Dépannage', generic);
    expect(match.score).toBe(0.8);
  });
});

describe('bestNameMatch — un mot commun n est pas une identité', () => {
  const generic = ['plomberie', 'plombier', 'chauffage', 'depannage'];

  it('refuse de donner le nom entier pour un seul mot banal partagé', () => {
    // LE défaut le plus dangereux trouvé par la calibration, parce qu il
    // fabrique des fusions AUTOMATIQUES fausses. Mesuré : « ACTIF SERVICES »
    // face à « Boulangerie Services » valait 1,00 — une boulangerie, score de
    // nom parfait — parce que la mesure jeton à jeton prend le maximum sur
    // les paires et qu un « services » commun suffisait. Avec une catégorie
    // qui concorde et une adresse proche, cela fusionnait tout seul.
    //
    // Un faux appariement ne se voit pas dans les statistiques : il se voit
    // au téléphone, et l appel est perdu.
    const variants = nameVariants('ACTIF SERVICES (PEDRO SERVICES)', null);
    expect(bestNameMatch(variants, 'Boulangerie Services', generic).score).toBeLessThan(0.55);
    expect(bestNameMatch(variants, 'Dupont Services', generic).score).toBeLessThan(0.55);
  });

  it('ne fusionne pas deux enseignes que seul un mot banal rapproche', () => {
    // Le meme defaut par l autre chemin, celui des mesures de chaine entiere :
    // « NANTES HABITAT » face a « RENNES HABITAT » atteignait 0,877 et
    // « MARTIN RENOVATION » face a « DURAND RENOVATION » 0,859 — au-dela du
    // seuil de fusion des que la categorie concorde et que l adresse est
    // proche. Deux villes, deux artisans, une seule fusion automatique fausse.
    for (const [source, fiche] of [
      ['NANTES HABITAT', 'RENNES HABITAT'],
      ['MARTIN RENOVATION', 'DURAND RENOVATION'],
      ['AB SERVICES', 'CD SERVICES'],
    ] as const) {
      const score = bestNameMatch(nameVariants(source, null), fiche, generic).score;
      // Le seuil qui compte est celui de la fusion : nom x 0,65 + 0,25 de
      // proximite maximale + 0,10 de categorie doit rester sous 0,85.
      expect(0.65 * score + 0.35).toBeLessThan(0.85);
    }
  });

  it('retient toujours la bonne fiche quand tous les mots concordent', () => {
    // Le garde-fou du test précédent : « PEDRO SERVICES » face à
    // « Pedro services » doit rester une fusion. Ce n est pas un mot commun,
    // ce sont TOUS les mots.
    const variants = nameVariants('ACTIF SERVICES (PEDRO SERVICES)', null);
    expect(bestNameMatch(variants, 'Pedro services', generic).score).toBe(1);
  });

  it('ne fait pas d un patronyme et d un escape game le même nom', () => {
    // Mesuré : « ERIC ESCAPIN » ~ « Leave in Time - Escape Game Nantes »
    // valait 0,91, parce que jaroWinkler("escapin","escape") vaut 0,910 et
    // qu un seul jeton emportait tout le score.
    const match = bestNameMatch(nameVariants('ERIC ESCAPIN', null), 'Leave in Time - Escape Game Nantes', generic);
    expect(match.score).toBeLessThan(0.55);
  });

  it('garde « H20 » face à « H2O Plomberie », l enseigne courte que la mesure vise', () => {
    // La restriction ne doit pas emporter le cas que `bestTokenScore`
    // documente explicitement : une enseigne d un seul mot, noyée dans un nom
    // candidat plus long.
    const match = bestNameMatch(nameVariants('ERIC ESCAPIN', 'H20'), 'H2O Plomberie', generic);
    expect(match.score).toBeGreaterThan(0.8);
  });
});

describe('configuration des métiers', () => {
  it('tient « dépannage » pour un mot de métier du plombier aussi', () => {
    // Trouvé sur le lot : « OUEST DEPANNAGE PLOMBERIE » obtenait 1,00 face à
    // « AMS Services - Spécialiste en Dépannage Plomberie… » sur le seul mot
    // « dépannage ». Il figurait dans les mots-clés du serrurier et pas dans
    // ceux du plombier, alors qu il qualifie exactement autant les deux.
    const plombier = getTrade('plombier');
    if (plombier === undefined) throw new Error('métier plombier absent');
    expect(plombier.keywords).toContain('depannage');
    // En queue de liste : `keywords[0]` sert à composer les noms de domaine,
    // où l on veut « plomberie » et non « depannage ».
    expect(plombier.keywords[0]).toBe('plomberie');
  });
});
