import { describe, expect, it } from 'vitest';
import { TRADES, getTrade } from './trades.js';

describe('trades', () => {
  it('expose plombier et serrurier', () => {
    expect(TRADES.map((t) => t.slug).sort()).toEqual(['plombier', 'serrurier']);
  });

  it('retrouve un métier par son slug', () => {
    expect(getTrade('plombier')?.label).toBe('Plombier');
    expect(getTrade('inconnu')).toBeUndefined();
  });

  it('utilise des codes NAF au format API, avec point', () => {
    for (const trade of TRADES) {
      expect(trade.nafCodes.length).toBeGreaterThan(0);
      for (const code of trade.nafCodes) {
        expect(code).toMatch(/^\d{2}\.\d{2}[A-Z]$/);
      }
    }
  });

  it('associe le plombier au 43.22A et le serrurier au 43.32B', () => {
    expect(getTrade('plombier')?.nafCodes).toContain('43.22A');
    expect(getTrade('serrurier')?.nafCodes).toContain('43.32B');
  });
});
