import { describe, expect, it } from 'vitest';
import { estCategorieBatiment, memeAdresse, normaliserAdresse } from './address-match.js';

describe('normaliserAdresse — les préfixes avant le numéro de voie', () => {
  // Toutes ces chaînes sont des `prospect.address` réels, relevés le
  // 5 septembre 2026. Prendre « le premier nombre » rendrait ici le bureau,
  // l'étage ou l'appartement : c'est l'erreur qui a faussé la première mesure
  // de ce chantier.

  it('ignore un numéro de bureau', () => {
    expect(normaliserAdresse('BUREAU 3 2 PLACE JEAN V 44000 NANTES')).toEqual({
      numero: '2',
      typeVoie: 'place',
      motsVoie: ['jean', 'v'],
      codePostal: '44000',
    });
  });

  it('ignore un numéro de porte', () => {
    expect(normaliserAdresse('PORTE 64 11 RUE FELIBIEN 44000 NANTES')).toEqual({
      numero: '11',
      typeVoie: 'rue',
      motsVoie: ['felibien'],
      codePostal: '44000',
    });
  });

  it('ignore un étage et un appartement enchaînés', () => {
    expect(normaliserAdresse('ETAGE 1 APPT 59 5 RUE ANITA CONTI 44300 NANTES')).toEqual({
      numero: '5',
      typeVoie: 'rue',
      motsVoie: ['anita', 'conti'],
      codePostal: '44300',
    });
  });

  it('ignore un étage écrit « 10E » suivi d’une porte lettrée', () => {
    expect(
      normaliserAdresse('10E ETAGE PORTE A 8 RUE DE SAINT JEAN DE LUZ 44200 NANTES'),
    ).toEqual({
      numero: '8',
      typeVoie: 'rue',
      motsVoie: ['saint', 'jean', 'luz'],
      codePostal: '44200',
    });
  });

  it('ignore un appartement, un étage et un bâtiment enchaînés', () => {
    expect(
      normaliserAdresse('APPT 47 ETAGE 1 BAT LA RIVETIERE 4 RUE PIERRE BOUGUER 44300 NANTES'),
    ).toEqual({
      numero: '4',
      typeVoie: 'rue',
      motsVoie: ['pierre', 'bouguer'],
      codePostal: '44300',
    });
  });

  it('ignore un nom de zone d’activité, apostrophe comprise', () => {
    expect(
      normaliserAdresse("ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX 44300 NANTES"),
    ).toEqual({
      numero: '1',
      typeVoie: 'rue',
      motsVoie: ['benelux'],
      codePostal: '44300',
    });
  });
});

describe('normaliserAdresse — les suffixes de numéro', () => {
  // Ces deux formes sont citées nommément par le spec §A2. La rue employée
  // est réelle ; le suffixe est greffé dessus, faute d’occurrence en base.

  it('rend le même numéro pour « 71 » et « 71B »', () => {
    expect(normaliserAdresse('71 RUE DU BENELUX 44300 NANTES').numero).toBe('71');
    expect(normaliserAdresse('71B RUE DU BENELUX 44300 NANTES').numero).toBe('71');
  });

  it('rend le même numéro pour « 30 BIS » et « 30 B »', () => {
    expect(normaliserAdresse('30 BIS RUE DU BENELUX 44300 NANTES').numero).toBe('30');
    expect(normaliserAdresse('30 B RUE DU BENELUX 44300 NANTES').numero).toBe('30');
  });
});

describe('normaliserAdresse — les abréviations et les mots-outils', () => {
  it('reconnaît « Rte » comme « ROUTE » et rend la même voie', () => {
    // Le type de voie ne porte aucune identité : il sert d’ancre, puis il
    // s’ignore. Chaîne Maps réelle contre chaîne SIRET réelle.
    expect(normaliserAdresse('211 Rte de Sainte-Luce, 44300 Nantes')).toEqual({
      numero: '211',
      typeVoie: 'route',
      motsVoie: ['sainte', 'luce'],
      codePostal: '44300',
    });
    expect(normaliserAdresse('211 ROUTE DE SAINTE LUCE 44300 NANTES')).toEqual({
      numero: '211',
      typeVoie: 'route',
      motsVoie: ['sainte', 'luce'],
      codePostal: '44300',
    });
  });

  it('retire les mots-outils, qui figurent dans presque toutes les adresses', () => {
    // Les laisser suffit à tout apparier avec tout.
    expect(normaliserAdresse('5 RUE LE NOTRE 44000 NANTES').motsVoie).toEqual(['notre']);
  });

  it('retire le code postal et tout ce qui le suit, nom de commune compris', () => {
    expect(normaliserAdresse('9 Rue Kléber, 44000 Nantes')).toEqual({
      numero: '9',
      typeVoie: 'rue',
      motsVoie: ['kleber'],
      codePostal: '44000',
    });
    expect(normaliserAdresse('1 Rue du Benelux, 44300 Nantes, France').motsVoie).toEqual([
      'benelux',
    ]);
  });

  it('retient le dernier code postal quand un numéro de CS en imite un', () => {
    // Chaîne Maps réelle : « CS 22201 » précède le vrai code postal, et la
    // mention de distribution ne doit pas entrer dans le nom de la voie.
    expect(normaliserAdresse('41 Bd Michelet CS 22201, 44322 Nantes CEDEX 3')).toEqual({
      numero: '41',
      typeVoie: 'boulevard',
      motsVoie: ['michelet'],
      codePostal: '44322',
    });
  });

  it('coupe la voie à la première mention de distribution', () => {
    // Sinon « cs » et « 22201 » deviennent des mots de rue, et l'adresse
    // Sirene correspondante — qui ne les porte pas — ne s'y retrouve plus.
    expect(
      meme('41 BOULEVARD MICHELET 44322 NANTES', '41 Bd Michelet CS 22201, 44322 Nantes CEDEX 3'),
    ).toBe(true);
    expect(normaliserAdresse('12 Rue Kepler, Bâtiment B, 44240 Nantes').motsVoie).toEqual([
      'kepler',
    ]);
  });

  it('reconnaît les abréviations que Maps emploie pour les autres types de voie', () => {
    // Sans elles, l'ancre n'est pas trouvée et la voie se ferme en silence.
    // « Allée » est un type très courant à Nantes.
    expect(normaliserAdresse('12 All. des Roses, 44000 Nantes')).toEqual({
      numero: '12',
      typeVoie: 'allee',
      motsVoie: ['roses'],
      codePostal: '44000',
    });
    expect(normaliserAdresse('3 Sq. du Bois, 44000 Nantes').typeVoie).toBe('square');
    expect(normaliserAdresse('10 Pass. des Arts, 44000 Nantes').typeVoie).toBe('passage');
    expect(normaliserAdresse('4 Crs Cambronne, 44000 Nantes').typeVoie).toBe('cours');
  });
});

describe('normaliserAdresse — ce qu’elle refuse de deviner', () => {
  it('rend tout vide sur une adresse absente', () => {
    expect(normaliserAdresse(null)).toEqual({
      numero: null,
      typeVoie: null,
      motsVoie: [],
      codePostal: null,
    });
  });

  it('ne rend aucun numéro quand aucun type de voie n’ancre la lecture', () => {
    // Chaîne Maps réelle. « Lot 12 » n’est pas un numéro de rue, et rien ne
    // permet de le savoir : l’absence se nomme plutôt qu’elle ne se devine.
    const lue = normaliserAdresse('ZA de la Distribution : Lot 12, 44200 Nantes, France');
    expect(lue.numero).toBeNull();
    expect(lue.motsVoie).toEqual([]);
    expect(lue.codePostal).toBe('44200');
  });

  it('ne rend aucun numéro quand le type de voie n’est précédé d’aucun nombre', () => {
    const lue = normaliserAdresse('RUE DU BENELUX 44300 NANTES');
    expect(lue.numero).toBeNull();
    expect(lue.motsVoie).toEqual([]);
  });
});

/** Raccourci de lecture : les deux côtés passent par la même normalisation. */
function meme(siret: string | null, maps: string | null): boolean {
  return memeAdresse(normaliserAdresse(siret), normaliserAdresse(maps));
}

describe('memeAdresse', () => {
  it('refuse « 9 avenue Général Marchand » face à « 9 rue Kléber »', () => {
    // Le faux positif que la première mesure de ce chantier a réellement
    // produit : même numéro, même code postal, deux rues sans rapport.
    expect(meme('9 AVENUE GENERAL MARCHAND 44000 NANTES', '9 Rue Kléber, 44000 Nantes')).toBe(
      false,
    );
  });

  it('accepte une adresse SIRET qui porte des mots en plus', () => {
    expect(
      meme(
        "ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX 44300 NANTES",
        '1 Rue du Benelux, 44300 Nantes',
      ),
    ).toBe(true);
  });

  it('refuse l’inclusion dans l’autre sens', () => {
    // La relation n'est pas symétrique, et c'est le cœur de la règle : des
    // mots en plus côté Maps sont des mots que le SIRET ne confirme pas.
    expect(
      meme(
        '1 RUE DU BENELUX 44300 NANTES',
        "1 Rue du Benelux Parc Nant'Est, 44300 Nantes",
      ),
    ).toBe(false);
  });

  it('accepte l’adresse identique malgré l’abréviation du type de voie', () => {
    expect(
      meme('211 ROUTE DE SAINTE LUCE 44300 NANTES', '211 Rte de Sainte-Luce, 44300 Nantes'),
    ).toBe(true);
  });

  it('refuse un code postal différent', () => {
    expect(meme('1 RUE DU BENELUX 44300 NANTES', '1 Rue du Benelux, 44000 Nantes')).toBe(false);
  });

  it('refuse un numéro différent', () => {
    expect(meme('1 RUE DU BENELUX 44300 NANTES', '3 Rue du Benelux, 44300 Nantes')).toBe(false);
  });

  it('refuse quand un numéro manque d’un côté', () => {
    expect(meme('RUE DU BENELUX 44300 NANTES', '1 Rue du Benelux, 44300 Nantes')).toBe(false);
    expect(meme('1 RUE DU BENELUX 44300 NANTES', 'Rue du Benelux, 44300 Nantes')).toBe(false);
  });

  it('refuse quand l’adresse Maps est absente', () => {
    expect(meme('1 RUE DU BENELUX 44300 NANTES', null)).toBe(false);
  });

  it('refuse quand la voie Maps ne porte aucun mot', () => {
    // Sans ce garde-fou, l'inclusion d'un ensemble vide serait toujours vraie
    // et n'importe quel numéro suffirait à apparier.
    expect(meme('1 RUE DU BENELUX 44300 NANTES', '1 Rue, 44300 Nantes')).toBe(false);
  });
});

describe('estCategorieBatiment', () => {
  it('accepte « Serrurier » quand on cherchait un plombier', () => {
    // Le cas BELENOS : enregistré « BELENOS SERRURERIE, BELENOS PLOMBERIE »,
    // classé « Serrurier » par Maps. L'artisan multi-métiers est la norme.
    expect(estCategorieBatiment('Serrurier')).toBe(true);
  });

  it('refuse « Boulangerie »', () => {
    // Le cas Sésame, à l'adresse exacte d'un installateur thermique : un autre
    // commerce dans le même immeuble.
    expect(estCategorieBatiment('Boulangerie')).toBe(false);
  });

  it('accepte les cinq métiers que le spec exige', () => {
    for (const libelle of ['Électricien', 'Couvreur', 'Maçon', 'Menuisier', 'Chauffagiste']) {
      expect(estCategorieBatiment(libelle)).toBe(true);
    }
  });

  it('accepte un libellé composé dont un mot seulement est un métier', () => {
    expect(estCategorieBatiment('Entreprise de rénovation')).toBe(true);
  });

  it('refuse les catégories réelles qui ne sont pas des métiers du bâtiment', () => {
    // Toutes relevées dans `prospect_enrichment.candidates`.
    for (const libelle of [
      'Santé',
      'Centre de formation',
      "Établissement d'enseignement professionnel",
      'Centre d’apprentissage',
    ]) {
      expect(estCategorieBatiment(libelle)).toBe(false);
    }
  });

  it('refuse « Dépannage », mauvais discriminant', () => {
    expect(estCategorieBatiment('Dépannage')).toBe(false);
  });

  it('refuse une catégorie absente', () => {
    expect(estCategorieBatiment(null)).toBe(false);
  });
});

describe('memeAdresse — le type de voie sépare les homonymes', () => {
  // Quai de la Fosse ET Rue de la Fosse, Rue Cambronne ET Cours Cambronne,
  // Place Graslin ET Rue Graslin existent toutes les six à Nantes 44000, aux
  // mêmes petits numéros et à quelques centaines de mètres. Effacer le type de
  // voie les confondait — et ni la catégorie ni la règle du doute ne
  // rattrapent le cas, puisqu'il n'y a qu'un seul candidat et qu'il est bien
  // du bâtiment.

  it('refuse un quai face à une rue du même nom', () => {
    expect(meme('2 QUAI DE LA FOSSE 44000 NANTES', '2 Rue de la Fosse, 44000 Nantes')).toBe(false);
  });

  it('refuse une rue face à un cours du même nom', () => {
    expect(meme('4 RUE CAMBRONNE 44000 NANTES', '4 Cours Cambronne, 44000 Nantes')).toBe(false);
  });

  it('refuse une place face à une rue du même nom', () => {
    expect(meme('1 PLACE GRASLIN 44000 NANTES', '1 Rue Graslin, 44000 Nantes')).toBe(false);
  });

  it('accepte toujours les deux écritures d’un même type de voie', () => {
    // Le type ne doit pas décider par son orthographe : ce sont les deux cas
    // réels des fusions du 5 septembre 2026.
    expect(meme('20 AVENUE PETIT BRETON 44100 NANTES', '20 Av. Petit Breton, 44100 Nantes')).toBe(
      true,
    );
    expect(
      meme('211 ROUTE DE SAINTE LUCE 44300 NANTES', '211 Rte de Sainte-Luce, 44300 Nantes'),
    ).toBe(true);
  });
});

describe('estCategorieBatiment — le négoce n’est pas l’artisan', () => {
  // Catégories Google réelles. Un grossiste sanitaire dans le même immeuble
  // que l'artisan cherché est exactement le cas « boulangerie » — en pire,
  // puisque son libellé porte le mot du métier.
  it('refuse un fournisseur, un grossiste et un loueur de matériel', () => {
    expect(estCategorieBatiment('Fournisseur de matériel de plomberie')).toBe(false);
    expect(estCategorieBatiment('Grossiste en matériel de chauffage')).toBe(false);
    expect(estCategorieBatiment('Location de matériel de terrassement')).toBe(false);
  });

  it('accepte toujours l’artisan dont le libellé ne porte aucun mot de négoce', () => {
    expect(estCategorieBatiment('Plombier')).toBe(true);
    expect(estCategorieBatiment('Entreprise de plomberie')).toBe(true);
  });
});
