// @vitest-environment node
//
// La config globale du dépôt tourne les tests sous jsdom (les composants
// montent de vrais éléments) : jsdom y remplace le `URL` global par le sien,
// et `fileURLToPath` de Node refuse alors cette instance. Ce test ne monte
// rien, ne lit qu'un fichier — l'environnement `node` lui rend le `URL`
// natif dont `new URL('./theme.css', import.meta.url)` a besoin.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const css = readFileSync(fileURLToPath(new URL('./theme.css', import.meta.url)), 'utf8');

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
});
