/// <reference types="vitest/config" />
import { getViteConfig } from 'astro/config';

/**
 * `getViteConfig` et non `defineConfig` : sans lui, Vitest ne sait pas
 * compiler un `.astro`, et les tests de rendu ne peuvent pas importer les
 * composants qu'ils éprouvent.
 *
 * `environment: 'node'` est imposé depuis Astro 6, qui refuse de rendre un
 * composant Astro dans un environnement client (jsdom). Le dashboard, lui,
 * tourne en jsdom parce qu'il monte de vrais composants React ; ici il n'y a
 * pas de DOM à simuler, seulement du HTML à produire.
 */
export default getViteConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
