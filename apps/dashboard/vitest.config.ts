import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    // `jsdom` et non `node` : les tests de rendu du spec (§13) montent de
    // vrais composants. Les modules purs (pagination, barème, i18n) n'en
    // dependent pas et tournent aussi bien dans cet environnement.
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
