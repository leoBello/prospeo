import { describe, expect, it } from 'vitest';
import { fr } from './fr.js';
import { en } from './en.js';
import { LOCALES, translate } from './translate.js';

describe('catalogues de traduction', () => {
  it('couvrent exactement les memes cles, une cle absente laissant sinon du francais dans un ecran anglais', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  it('ne laissent aucune chaine vide, qui disparaitrait de l ecran sans erreur', () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(locale === 'fr' ? fr : en)) {
        expect(value, `${locale}.${key}`).not.toBe('');
      }
    }
  });

  it('declarent la forme plurielle partout ou la forme singuliere existe', () => {
    for (const catalogue of [fr, en]) {
      for (const key of Object.keys(catalogue)) {
        if (key.endsWith('_one')) {
          expect(Object.keys(catalogue)).toContain(key.slice(0, -'_one'.length));
        }
      }
    }
  });
});

describe('translate', () => {
  it('rend la chaine de la locale demandee', () => {
    expect(translate('fr', 'nav.today')).toBe("Aujourd'hui");
    expect(translate('en', 'nav.today')).toBe('Today');
  });

  it('substitue les parametres nommes', () => {
    expect(translate('fr', 'today.reason.followUp.late', { days: 3 })).toContain('3');
  });

  it('laisse le jeton visible quand un parametre manque, plutot que d afficher un trou', () => {
    // Un `undefined` silencieux produirait « en retard de  j » : illisible et
    // indétectable en relecture. Le jeton intact désigne la faute.
    expect(translate('fr', 'today.reason.followUp.late', {})).toContain('{days}');
  });

  it('traite zero comme un singulier en francais et comme un pluriel en anglais', () => {
    // Règle de langue, pas de préférence : « 0 prospect » et « 0 prospects »
    // sont l'un et l'autre la forme correcte dans leur langue.
    expect(translate('fr', 'unit.prospects', { count: 0 })).toBe('0 prospect');
    expect(translate('en', 'unit.prospects', { count: 0 })).toBe('0 prospects');
    expect(translate('fr', 'unit.prospects', { count: 1 })).toBe('1 prospect');
    expect(translate('en', 'unit.prospects', { count: 1 })).toBe('1 prospect');
    expect(translate('fr', 'unit.prospects', { count: 2 })).toBe('2 prospects');
    expect(translate('en', 'unit.prospects', { count: 2 })).toBe('2 prospects');
  });
});
