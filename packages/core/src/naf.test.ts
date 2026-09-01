import { describe, expect, it } from 'vitest';
import { nafMatchesTrade } from './naf.js';
import { getTrade } from './trades.js';

const plombier = getTrade('plombier');
if (plombier === undefined) throw new Error('métier plombier absent');

describe('nafMatchesTrade', () => {
  it('reconnaît le code du métier', () => {
    expect(nafMatchesTrade('43.22A', plombier)).toBe(true);
  });

  it('signale un code étranger au métier', () => {
    // Cas réel : GROUPE AMH, retenu parce que l entreprise est plombier,
    // mais dont l établissement fait de l installation électrique.
    expect(nafMatchesTrade('43.21A', plombier)).toBe(false);
  });

  it('tolère un code sans point', () => {
    expect(nafMatchesTrade('4322A', plombier)).toBe(true);
  });

  it('rend null quand le code est inconnu, sans le supposer divergent', () => {
    expect(nafMatchesTrade(null, plombier)).toBeNull();
  });
});
