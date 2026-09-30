import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

// The deployed site serves the slot under /ashfall/ next to the lobby web app (see scripts/build-site.mjs).
// Dev keeps "/" so `pnpm dev` works unchanged; ASHFALL_BASE overrides either.
export default defineConfig(({ command }) => ({
  base: process.env['ASHFALL_BASE'] ?? (command === 'build' ? '/ashfall/' : '/'),
  resolve: {
    alias: {
      '@math': fileURLToPath(new URL('../../packages/ashfall-math/src/math', import.meta.url)),
      '@config': fileURLToPath(new URL('../../packages/ashfall-math/src/config', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  server: {
    host: true,
  },
}));
