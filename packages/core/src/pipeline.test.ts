import { describe, expect, it } from 'vitest';
import { estUnRefus, STATUTS_REFUS } from './pipeline.js';

describe('estUnRefus', () => {
  it('reconnaît les deux statuts qui valent refus', () => {
    expect(estUnRefus('ne_pas_contacter')).toBe(true);
    expect(estUnRefus('perdu')).toBe(true);
  });

  it('laisse passer les statuts d’un échange encore ouvert', () => {
    for (const s of ['a_contacter', 'contacte', 'relance', 'interesse', 'gagne']) {
      expect(estUnRefus(s)).toBe(false);
    }
  });

  it('traite l’absence de statut comme l’absence de refus', () => {
    // Un prospect sans ligne `prospect_pipeline` n'a jamais été contacté :
    // c'est le cas NORMAL au premier run, et c'était celui des 139 lignes de
    // la base le 1er septembre 2026. Le lire comme un refus arrêterait la
    // chaîne entière ; le lire comme un feu vert est ce que le socle fait
    // déjà en donnant `a_contacter` par défaut à la colonne.
    expect(estUnRefus(null)).toBe(false);
    expect(estUnRefus(undefined)).toBe(false);
  });

  it('est la SEULE liste de statuts-refus du projet', () => {
    // `unpublish` retire un site sur ces statuts, `pitch` refuse d'écrire un
    // message pour eux. Les deux gardes doivent bouger ensemble : une liste
    // recopiée laisserait un jour `pitch` rédiger un argumentaire pour un
    // artisan dont on vient de dépublier le site parce qu'il a dit non.
    expect([...STATUTS_REFUS].sort()).toEqual(['ne_pas_contacter', 'perdu']);
  });
});
