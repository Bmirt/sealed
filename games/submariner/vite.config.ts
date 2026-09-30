import { defineConfig } from 'vite';

// The deployed site serves the game under /submariner/ next to the lobby (see scripts/build-site.mjs).
// Dev keeps "/" so `pnpm dev` works unchanged; SUBMARINER_BASE overrides either.
export default defineConfig(({ command }) => ({
  base: process.env['SUBMARINER_BASE'] ?? (command === 'build' ? '/submariner/' : '/'),
  server: { host: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
}));
