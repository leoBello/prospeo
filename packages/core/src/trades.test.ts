import { describe, expect, it } from 'vitest';
import { CATEGORIES_BATIMENT, TRADES, getTrade, templateRepoFor } from './trades.js';

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

describe('CATEGORIES_BATIMENT', () => {
  it('contient les cinq métiers que le spec exige au minimum', () => {
    for (const metier of ['electricien', 'couvreur', 'macon', 'menuisier', 'chauffagiste']) {
      expect(CATEGORIES_BATIMENT).toContain(metier);
    }
  });

  it('couvre tous les libellés de catégorie des métiers configurés', () => {
    // La voie adresse ne doit jamais refuser ce que le score, lui, accepte
    // déjà comme confirmation du métier.
    for (const trade of TRADES) {
      for (const label of trade.categoryLabels) {
        expect(CATEGORIES_BATIMENT).toContain(label);
      }
    }
  });

  it('exclut « depannage », mauvais discriminant déjà identifié', () => {
    // Il qualifie autant l'électroménager que l'automobile : voir le
    // commentaire de `matchesCategory` dans matching.ts.
    expect(CATEGORIES_BATIMENT).not.toContain('depannage');
  });

  it('ne contient que des mots déjà normalisés, comparables tels quels', () => {
    // La comparaison se fait mot à mot contre un libellé Google normalisé :
    // une entrée accentuée ou composée n'y serait jamais retrouvée, et le
    // manque serait silencieux.
    for (const mot of CATEGORIES_BATIMENT) {
      expect(mot).toBe(mot.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
      expect(mot).not.toContain(' ');
      expect(mot).not.toBe('');
    }
  });
});
