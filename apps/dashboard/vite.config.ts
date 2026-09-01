import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  /**
   * Le `.env` du dépôt est à la racine du monorepo, pas dans ce paquet.
   *
   * Sans cette ligne, Vite cherche `.env` dans `apps/dashboard/`, ne trouve
   * rien, et injecte un `import.meta.env` sans les variables `VITE_*`. Le
   * build réussit, le bundle part sans clé, et l'application n'échoue qu'à
   * l'ouverture — au message le plus trompeur qui soit, « configuration
   * incomplète », alors que le `.env` est correctement rempli.
   *
   * Seules les variables préfixées `VITE_` sont exposées : élargir le
   * répertoire de lecture n'expose pas `SUPABASE_SERVICE_ROLE_KEY`, qui reste
   * hors du bundle.
   */
  envDir: '../..',
});
