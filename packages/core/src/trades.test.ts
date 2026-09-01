import { describe, expect, it } from 'vitest';
import { TRADES, getTrade, templateRepoFor } from './trades.js';

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

describe('templateRepoFor', () => {
  it('prend le dépôt modèle déclaré par le métier', () => {
    // Décision de l'utilisateur : un modèle par métier, et non un modèle
    // unique. Le site reste neutre en métier (D1) — `prospeo/plombier` et
    // `prospeo/serrurier` en sont aujourd'hui deux copies identiques — mais
    // rien n'oblige à ce qu'ils le restent.
    expect(templateRepoFor(getTrade('plombier')!, 'ignore')).toBe('plombier');
    expect(templateRepoFor(getTrade('serrurier')!, 'ignore')).toBe('serrurier');
  });

  it('retombe sur le réglage global quand le métier ne déclare rien', () => {
    // Ce repli est ce qui permettra à une interface de gestion de trancher
    // depuis la base, sans toucher au code.
    const sansModele = { ...getTrade('plombier')!, templateRepo: undefined };
    expect(templateRepoFor(sansModele, 'site-artisan-template')).toBe('site-artisan-template');
  });

  it('échoue franchement quand aucun modèle n’est connu', () => {
    // Publier depuis un modèle inconnu créerait des dépôts au nom
    // d'entreprises réelles à partir d'on ne sait quoi. Mieux vaut ne rien
    // faire.
    const sansModele = { ...getTrade('plombier')!, templateRepo: undefined };
    expect(() => templateRepoFor(sansModele, undefined)).toThrow(/plombier/);
    expect(() => templateRepoFor(sansModele, '  ')).toThrow();
  });
});
