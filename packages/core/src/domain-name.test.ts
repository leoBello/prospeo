import { describe, expect, it } from 'vitest';
import { domainCandidates } from './domain-name.js';
import { getTrade } from './trades.js';

const plombier = getTrade('plombier');
if (plombier === undefined) throw new Error('métier plombier absent');

describe('domainCandidates', () => {
  it('propose le nom seul puis ses combinaisons avec le métier', () => {
    expect(domainCandidates('SARL ALLARD', plombier)).toEqual([
      'allard.fr',
      'plomberie-allard.fr',
      'allard-plomberie.fr',
    ]);
  });

  it('ne répète pas le métier déjà présent dans le nom', () => {
    expect(domainCandidates('PLOMBERIE MARTIN', plombier)).toEqual(['plomberie-martin.fr']);
  });

  it('joint les mots multiples par un tiret', () => {
    expect(domainCandidates('OUEST DEPANNAGE', plombier)[0]).toBe('ouest-depannage.fr');
  });

  it('ne propose rien pour un nom vide de sens', () => {
    expect(domainCandidates('SARL', plombier)).toEqual([]);
  });
});
