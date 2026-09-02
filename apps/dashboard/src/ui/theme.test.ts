// @vitest-environment node
//
// La config globale du dépôt tourne les tests sous jsdom (les composants
// montent de vrais éléments) : jsdom y remplace le `URL` global par le sien,
// et `fileURLToPath` de Node refuse alors cette instance. Ce test ne monte
// rien, ne lit qu'un fichier — l'environnement `node` lui rend le `URL`
// natif dont `new URL('./theme.css', import.meta.url)` a besoin.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

// `theme.test.ts` vit dans `src/ui/` : la racine du code applicatif, celle
// dont dependent tous les ecrans et composants, est son parent.
const racineSrc = dirname(fileURLToPath(new URL('.', import.meta.url)));

/**
 * Parcourt `dir` recursivement et retourne le chemin de chaque fichier dont
 * le nom se termine par `suffixe`.
 *
 * Ecrite a la main plutot que via `readdirSync(dir, { recursive: true })` :
 * la variante recursive de Node existe, mais un test cense prouver qu'un
 * parcours de fichiers ne s'est pas silencieusement vide doit rester lisible
 * ligne a ligne, sans compter sur le comportement d'une option recente.
 */
function listerFichiers(dir: string, suffixe: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dir, { withFileTypes: true })) {
    const chemin = join(dir, entree.name);
    if (entree.isDirectory()) {
      listerFichiers(chemin, suffixe, acc);
    } else if (entree.name.endsWith(suffixe)) {
      acc.push(chemin);
    }
  }
  return acc;
}

/**
 * Luminance relative WCAG d'une couleur hexadécimale.
 *
 * Recopiée ici plutôt qu'importée : le test doit pouvoir échouer même si le
 * code applicatif est cassé, et une dépendance de plus pour six lignes de
 * calcul ne se justifie pas.
 */
function luminance(hex: string): number {
  const canal = (n: number) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return (
    0.2126 * canal((n >> 16) & 255) +
    0.7152 * canal((n >> 8) & 255) +
    0.0722 * canal(n & 255)
  );
}

function contraste(a: string, b: string): number {
  const [clair, sombre] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((clair as number) + 0.05) / ((sombre as number) + 0.05);
}

/** Lit un token dans un bloc de sélecteur donné. */
function token(selecteur: string, nom: string): string {
  const bloc = css.split(selecteur)[1]?.split('}')[0] ?? '';
  return new RegExp(`${nom}:\\s*([^;]+);`).exec(bloc)?.[1]?.trim() ?? '';
}

describe('theme.css', () => {
  it('donne au texte secondaire le contraste AA, dans les deux themes', () => {
    // La reserve du chantier 1 : cette couleur porte la « raison de presence »
    // de chaque ligne, que le §9.2 tient pour essentielle. A 3,60:1 elle etait
    // sous le seuil, et l'ecart avait ete remonte plutot que corrige.
    const sombre = contraste(token(':root {', '--color-text-muted'), token(':root {', '--color-surface'));
    expect(sombre).toBeGreaterThanOrEqual(4.5);

    const clair = contraste(
      token(":root[data-theme='light']", '--color-text-muted'),
      token(":root[data-theme='light']", '--color-surface'),
    );
    expect(clair).toBeGreaterThanOrEqual(4.5);
  });

  it('declare les trois familles typographiques de D6', () => {
    expect(css).toContain('--font-display:');
    expect(css).toContain('--font-ui:');
    expect(css).toContain('--font-mono:');
  });

  it('n abandonne aucun token utilise par les composants existants', () => {
    // La tache 1 ne doit casser aucun ecran : les composants actuels lisent
    // ces variables, les renommer les rendrait transparents.
    for (const t of ['--color-bg', '--color-surface', '--color-border', '--color-text', '--color-accent', '--color-danger', '--color-warning']) {
      expect(css).toContain(`${t}:`);
    }
  });

  it('sert la fonte d affichage a plus d un fichier (tache 1 du lot 3)', () => {
    const feuillesDeStyle = listerFichiers(racineSrc, '.module.css');

    // Garde-fou : si le parcours casse (mauvais dossier, extension mal
    // ecrite), `feuillesDeStyle` tombe a zero et l'assertion du dessous
    // passerait vide silencieusement — 0 fichier employant la fonte ne serait
    // alors jamais distingue d'un parcours qui n'a rien lu. Le nombre reel de
    // feuilles CSS du dashboard (plus d'une vingtaine) sert de seuil.
    expect(feuillesDeStyle.length).toBeGreaterThan(15);

    const consommateurs = feuillesDeStyle.filter((chemin) =>
      readFileSync(chemin, 'utf8').includes('var(--font-display)'),
    );

    // Avant la tache 1, seul `ScoreCompact.module.css` la consommait : la
    // fonte etait telechargee a chaque page pour un unique usage. Le lot
    // l'etend aux titres d'ecran et au titre du panneau prospect.
    expect(consommateurs.length).toBeGreaterThan(1);
  });

  it('ne laisse aucun token declare sans consommateur, hors reserve documentee', () => {
    // Tokens sans consommateur au moment de la tache 1, mais dont la decision
    // (les employer ou les retirer) revient au pilote du chantier plutot qu'a
    // ce test — voir `.superpowers/sdd/task-1-report.md`. Toute entree ajoutee
    // ici doit etre justifiee dans ce rapport ; ce n'est pas une echappatoire
    // pour faire taire un futur token mort.
    const reserveDocumentee = new Set(['--space-6', '--z-overlay']);

    const fichiersSource = [...listerFichiers(racineSrc, '.module.css'), ...listerFichiers(racineSrc, '.tsx')];

    // Meme garde-fou que ci-dessus : sans lui, un parcours casse (zero
    // fichier lu) ferait passer TOUS les tokens pour orphelins, ou pire,
    // TOUS pour consommes selon la forme du bug — dans les deux cas en
    // silence plutot qu'en echec net.
    expect(fichiersSource.length).toBeGreaterThan(30);

    const contenus = fichiersSource.map((chemin) => readFileSync(chemin, 'utf8'));
    // `--font-ui` n'a pas de consommateur hors theme.css : c'est la police du
    // `body`, la base dont tout le reste herite. Sa propre feuille compte.
    contenus.push(css);

    const tokensDeclares = [
      ...new Set(
        [...css.matchAll(/(--[a-z0-9-]+):/g)]
          .map((m) => m[1])
          .filter((nom): nom is string => nom !== undefined),
      ),
    ];

    const orphelins = tokensDeclares.filter(
      (tok) => !reserveDocumentee.has(tok) && !contenus.some((contenu) => contenu.includes(`var(${tok})`)),
    );

    expect(orphelins).toEqual([]);
  });
});
