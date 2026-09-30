import { defineConfig } from 'vite';

// The deployed site serves the game under /submariner/ next to the lobby (see scripts/build-site.mjs).
// Dev keeps "/" so `pnpm dev` works unchanged; SUBMARINER_BASE overrides either.
export default defineConfig(({ command }) => ({
  base: process.env['SUBMARINER_BASE'] ?? (command === 'build' ? '/submariner/' : '/'),
  server: {
    host: true,
    // Transform the game graph as soon as the dev server starts instead of on the first visit.
    warmup: { clientFiles: ['./src/main.ts'] },
  },
  optimizeDeps: {
    include: [
      'three',
      'lil-gui',
      'three/addons/environments/RoomEnvironment.js',
      'three/addons/postprocessing/EffectComposer.js',
      'three/addons/postprocessing/OutputPass.js',
      'three/addons/postprocessing/RenderPass.js',
      'three/addons/postprocessing/ShaderPass.js',
      'three/addons/postprocessing/UnrealBloomPass.js',
      'three/addons/utils/BufferGeometryUtils.js',
    ],
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
}));
