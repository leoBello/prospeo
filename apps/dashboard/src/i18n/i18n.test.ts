// @vitest-environment node
//
// Ce fichier ne monte rien : il lit des fichiers du disque pour vérifier que
// chaque clé du catalogue a un consommateur. Sous jsdom, `URL` est remplacé
// par celui de jsdom et `fileURLToPath` de Node refuse cette instance — même
// raison que dans `ui/theme.test.ts`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

/**
 * Clés fabriquées à l'exécution, qu'aucune recherche textuelle ne peut
 * trouver — et qui doivent donc être déclarées ici, une par une, avec la
 * raison.
 *
 * `pipeline.status.*` n'y figure PAS, bien qu'il soit lui aussi composé par
 * `CLE_STATUT` : ces sept clés sont écrites littéralement dans le `Record`
 * de `kit/StatusBadge.tsx`, la recherche les trouve, et les allowlister
 * reviendrait à retirer sept clés de la surveillance sans contrepartie.
 */
const COMPOSEES_A_L_EXECUTION: readonly string[] = [
  // `PipelineSection.tsx` : `CLE_CANAL = (k) => `interaction.kind.${k}``, sur
  // l'énumération `interaction_kind` de la base. Aucune de ces cinq clés
  // n'apparaît littéralement dans le code.
  'interaction.kind.',
  // `RangeeVeille.tsx` compose `trade.${prospect.tradeSlug}` sur les slugs de
  // `TRADES` ; aucune de ces clés n'apparaît littéralement dans le code.
  'trade.',
];

/** Tous les `.ts`/`.tsx` du dashboard hors catalogues et hors tests. */
function sourcesApplicatives(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree !== 'i18n') sourcesApplicatives(chemin, acc);
    } else if (/\.tsx?$/.test(chemin) && !chemin.includes('.test.')) {
      acc.push(chemin);
    }
  }
  return acc;
}

describe('clés orphelines', () => {
  it('ne garde aucune clé que plus aucun écran ne consomme', () => {
    // Quatre clés avaient survécu à la refonte du panneau sans consommateur :
    // `score.total` et `score.outOf`, remplacées par `ScoreCompact`, et
    // `value.mobile` / `value.landline`, dont la disparition avait effacé de
    // l'écran une distinction que le barème continuait de payer. Rien ne les
    // signalait. Ce test est ce qui les aurait vues.
    //
    // Les tests sont exclus de la recherche à dessein : une clé qui n'est
    // citée que par un test n'a pas de consommateur, elle a un témoin.
    const racine = fileURLToPath(new URL('..', import.meta.url));
    const source = sourcesApplicatives(racine)
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n');

    const orphelines = Object.keys(fr).filter((cle) => {
      // Une forme `_one` n'est jamais écrite dans le code : `translate` la
      // dérive de la clé nue. Son consommateur est donc celui de sa base.
      const base = cle.endsWith('_one') ? cle.slice(0, -'_one'.length) : cle;
      if (COMPOSEES_A_L_EXECUTION.some((prefixe) => base.startsWith(prefixe))) return false;
      return ![`'${base}'`, `"${base}"`, `\`${base}\``].some((forme) => source.includes(forme));
    });

    expect(orphelines).toEqual([]);
  });
});
