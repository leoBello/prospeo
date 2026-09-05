import { describe, expect, it } from 'vitest';
import { normaliserAdresse } from './address-match.js';

describe('normaliserAdresse — les préfixes avant le numéro de voie', () => {
  // Toutes ces chaînes sont des `prospect.address` réels, relevés le
  // 5 septembre 2026. Prendre « le premier nombre » rendrait ici le bureau,
  // l'étage ou l'appartement : c'est l'erreur qui a faussé la première mesure
  // de ce chantier.

  it('ignore un numéro de bureau', () => {
    expect(normaliserAdresse('BUREAU 3 2 PLACE JEAN V 44000 NANTES')).toEqual({
      numero: '2',
      motsVoie: ['jean', 'v'],
      codePostal: '44000',
    });
  });

  it('ignore un numéro de porte', () => {
    expect(normaliserAdresse('PORTE 64 11 RUE FELIBIEN 44000 NANTES')).toEqual({
      numero: '11',
      motsVoie: ['felibien'],
      codePostal: '44000',
    });
  });

  it('ignore un étage et un appartement enchaînés', () => {
    expect(normaliserAdresse('ETAGE 1 APPT 59 5 RUE ANITA CONTI 44300 NANTES')).toEqual({
      numero: '5',
      motsVoie: ['anita', 'conti'],
      codePostal: '44300',
    });
  });

  it('ignore un étage écrit « 10E » suivi d’une porte lettrée', () => {
    expect(
      normaliserAdresse('10E ETAGE PORTE A 8 RUE DE SAINT JEAN DE LUZ 44200 NANTES'),
    ).toEqual({
      numero: '8',
      motsVoie: ['saint', 'jean', 'luz'],
      codePostal: '44200',
    });
  });

  it('ignore un appartement, un étage et un bâtiment enchaînés', () => {
    expect(
      normaliserAdresse('APPT 47 ETAGE 1 BAT LA RIVETIERE 4 RUE PIERRE BOUGUER 44300 NANTES'),
    ).toEqual({
      numero: '4',
      motsVoie: ['pierre', 'bouguer'],
      codePostal: '44300',
    });
  });

  it('ignore un nom de zone d’activité, apostrophe comprise', () => {
    expect(
      normaliserAdresse("ZONE NANT'EST ENTREPRISES 1 RUE DU BENELUX 44300 NANTES"),
    ).toEqual({
      numero: '1',
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
      motsVoie: ['sainte', 'luce'],
      codePostal: '44300',
    });
    expect(normaliserAdresse('211 ROUTE DE SAINTE LUCE 44300 NANTES')).toEqual({
      numero: '211',
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
      motsVoie: ['kleber'],
      codePostal: '44000',
    });
    expect(normaliserAdresse('1 Rue du Benelux, 44300 Nantes, France').motsVoie).toEqual([
      'benelux',
    ]);
  });

  it('retient le dernier code postal quand un numéro de CS en imite un', () => {
    // Chaîne Maps réelle : « CS 22201 » précède le vrai code postal.
    expect(normaliserAdresse('41 Bd Michelet CS 22201, 44322 Nantes CEDEX 3').codePostal).toBe(
      '44322',
    );
  });
});

describe('normaliserAdresse — ce qu’elle refuse de deviner', () => {
  it('rend tout vide sur une adresse absente', () => {
    expect(normaliserAdresse(null)).toEqual({
      numero: null,
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
