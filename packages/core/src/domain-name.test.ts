import { describe, expect, it } from 'vitest';
import { domainCandidates } from './domain-name.js';
import { getTrade } from './trades.js';

const plombier = getTrade('plombier');
if (plombier === undefined) throw new Error('métier plombier absent');

describe('domainCandidates', () => {
  it('propose le nom seul puis ses combinaisons avec le métier', () => {
    expect(domainCandidates('SARL ALLARD', null, plombier)).toEqual([
      'allard.fr',
      'plomberie-allard.fr',
      'allard-plomberie.fr',
    ]);
  });

  it('ne répète pas le métier déjà présent dans le nom', () => {
    expect(domainCandidates('PLOMBERIE MARTIN', null, plombier)).toEqual(['plomberie-martin.fr']);
  });

  it('joint les mots multiples par un tiret', () => {
    expect(domainCandidates('OUEST DEPANNAGE', null, plombier)[0]).toBe('ouest-depannage.fr');
  });

  it('ne propose rien pour un nom vide de sens', () => {
    expect(domainCandidates('SARL', null, plombier)).toEqual([]);
  });
  it('retient l enseigne plutot que l etat civil d un entrepreneur individuel', () => {
    // Cas reel : Sirene enregistre l etat civil accole a l enseigne. La
    // derivation directe produisait
    // « philippe-delaitre-popo-les-bons-tuyaux-philippe-delaitre.fr », un nom
    // evidemment libre et sans aucune valeur d argument.
    const noms = domainCandidates(
      'PHILIPPE DELAITRE (POPO LES BONS TUYAUX / PHILIPPE DELAITRE)',
      'POPO LES BONS TUYAUX / PHILIPPE DELAITRE',
      plombier,
    );
    for (const nom of noms) expect(nom.length).toBeLessThanOrEqual(34);
    expect(noms[0]).toBe('philippe-delaitre.fr');
  });

  it('retient la denomination usuelle quand elle est plus courte', () => {
    expect(domainCandidates('GHAITH RAHALI (RGSERVICES)', 'RGSERVICES', plombier)[0]).toBe(
      'rgservices.fr',
    );
  });
});
