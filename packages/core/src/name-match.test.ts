import { describe, expect, it } from 'vitest';
import {
  bestNameMatch,
  jaroWinkler,
  nameVariants,
  significantTokens,
  tokenContainment,
} from './name-match.js';

describe('jaroWinkler', () => {
  it('vaut 1 pour deux chaînes identiques', () => {
    expect(jaroWinkler('martin', 'martin')).toBe(1);
  });

  it('vaut 0 pour deux chaînes sans lettre commune', () => {
    expect(jaroWinkler('abc', 'xyz')).toBe(0);
  });

  it('récompense un préfixe commun', () => {
    expect(jaroWinkler('h20', 'h2o')).toBeGreaterThan(0.85);
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
    expect(tokenContainment('martin', 'plomberie martin fils', ['plomberie'])).toBe(1);
  });

  it('vaut 0 sans jeton significatif commun', () => {
    expect(tokenContainment('escapin', 'plomberie martin', ['plomberie'])).toBe(0);
  });

  it('vaut 0 quand la source n a aucun jeton significatif', () => {
    // « Plomberie » face à « SOS Plomberie » ne doit pas valoir 1 : sinon
    // deux entreprises sans rapport s apparient sur un mot de métier.
    expect(tokenContainment('plomberie', 'sos plomberie', ['plomberie'])).toBe(0);
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
    expect(match.score).toBeGreaterThan(0.85);
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

  it('rattrape un patronyme noyé dans un nom commercial', () => {
    const match = bestNameMatch(nameVariants('SARL ALLARD', null), 'Allard Plomberie', generic);
    expect(match.score).toBeGreaterThan(0.85);
  });

  it('ne rapproche pas deux entreprises que seul le métier réunit', () => {
    const match = bestNameMatch(nameVariants('SARL ALLARD', null), 'Plomberie Dupont', generic);
    expect(match.score).toBeLessThan(0.55);
  });

  it('renvoie un score nul sans variante', () => {
    expect(bestNameMatch([], 'Plomberie Dupont', generic)).toEqual({ score: 0, variant: null });
  });
});
