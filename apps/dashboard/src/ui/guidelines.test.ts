// @vitest-environment node
//
// Ce fichier ne monte rien : il LIT les feuilles de style du dépôt pour faire
// respecter les règles de `docs/design/GUIDELINES.md`. Sous jsdom, `URL` est
// remplacé par celui de jsdom et `fileURLToPath` de Node refuse cette
// instance — même raison que dans `ui/theme.test.ts` et `i18n/i18n.test.ts`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const RACINE = fileURLToPath(new URL('..', import.meta.url));

/**
 * Toutes les feuilles de style de modules du dashboard.
 *
 * `theme.css` en est exclu : c'est LUI qui déclare les couleurs et les
 * familles, et le seul endroit du dépôt où une valeur littérale a le droit
 * d'exister. Tout le reste doit passer par ses tokens.
 */
function feuillesDeComposant(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree);
    if (statSync(chemin).isDirectory()) feuillesDeComposant(chemin, acc);
    else if (entree.endsWith('.module.css')) acc.push(chemin);
  }
  return acc;
}

const FEUILLES = feuillesDeComposant(RACINE).map((chemin) => ({
  chemin: chemin.slice(RACINE.length).replace(/\\/g, '/'),
  contenu: readFileSync(chemin, 'utf8'),
}));

/** Retire les commentaires : ils citent souvent la maquette, valeurs comprises. */
function sansCommentaires(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Découpe une feuille en blocs de déclarations, un par accolade ouvrante. */
function blocs(css: string): string[] {
  return [...sansCommentaires(css).matchAll(/\{([^{}]*)\}/g)].map((m) => m[1] ?? '');
}

describe('règles de conception (docs/design/GUIDELINES.md)', () => {
  it('trouve les feuilles de style — sinon tout ce qui suit passerait à vide', () => {
    // Garde-fou : un parcours cassé rendrait chaque règle ci-dessous vraie
    // sur l'ensemble vide, en silence. Le dashboard en compte largement plus.
    expect(FEUILLES.length).toBeGreaterThan(10);
  });

  it('ne laisse aucune couleur littérale hors de theme.css', () => {
    // La doctrine du dépôt : « aucune couleur en dur dans un composant,
    // uniquement des var(--…) de theme.css ». C'est la condition pour que le
    // thème clair reste livrable — une couleur écrite en dur ne bascule pas.
    // `color-mix(in srgb, var(--x) N%, transparent)` reste permis : il ne
    // porte aucune valeur littérale, seulement un token et un pourcentage.
    //
    // Le contrôle porte sur les VALEURS de déclaration, jamais sur le texte
    // brut du fichier : `white-space: nowrap` contient « white » sans être
    // une couleur, et la première version de ce test signalait sept fichiers
    // dont six pour cette seule raison. Une règle qui crie à tort finit
    // ignorée, et ne protège alors plus rien.
    const LITTERALES = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\s*\(|\b(?:black|white|red|blue|green|yellow|orange|purple|gray|grey)\b/;
    const fautives: string[] = [];
    for (const { chemin, contenu } of FEUILLES) {
      for (const bloc of blocs(contenu)) {
        for (const declaration of bloc.split(';')) {
          const separateur = declaration.indexOf(':');
          if (separateur === -1) continue;
          const valeur = declaration.slice(separateur + 1);
          if (LITTERALES.test(valeur)) fautives.push(`${chemin} → ${declaration.trim()}`);
        }
      }
    }
    expect(fautives).toEqual([]);
  });

  it('ne laisse aucune famille typographique hors des tokens', () => {
    // D6 fixe trois familles, et `theme.css` les nomme. Une `font-family`
    // écrite en dur dans un composant en ajouterait une quatrième sans que
    // personne ne l'ait décidé.
    const fautives = FEUILLES.filter(({ contenu }) =>
      [...sansCommentaires(contenu).matchAll(/font-family\s*:\s*([^;]+);/g)].some(
        (m) => !(m[1] ?? '').includes('var(--font-'),
      ),
    ).map(({ chemin }) => chemin);
    expect(fautives).toEqual([]);
  });

  it('ne pose jamais text-overflow: ellipsis sur un conteneur flex ou grid', () => {
    // `text-overflow` n'agit que sur du contenu EN LIGNE : posé sur un
    // conteneur flex ou grid, il ne fait rien — et le texte, au lieu de
    // s'abréger, déborde et chevauche ce qui le suit. Ce dépôt l'a payé deux
    // fois : le nom du palier tranché sur « Prospecteur → Clos », chevauchant
    // le compteur de points. La règle est mécanique, donc elle se tient.
    const fautifs: string[] = [];
    for (const { chemin, contenu } of FEUILLES) {
      for (const bloc of blocs(contenu)) {
        const ellipse = /text-overflow\s*:\s*ellipsis/.test(bloc);
        const conteneur = /display\s*:\s*(inline-)?(flex|grid)/.test(bloc);
        if (ellipse && conteneur) fautifs.push(chemin);
      }
    }
    expect(fautifs).toEqual([]);
  });
});
