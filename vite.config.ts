/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages project sites live at https://<user>.github.io/<repo>/.
// The deploy workflow sets VITE_BASE=/<repo>/ automatically. A relative base
// ("./") is used otherwise so the built files also work from any sub-folder.
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
  },
});
