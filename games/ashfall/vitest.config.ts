import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@math': fileURLToPath(new URL('../../packages/ashfall-math/src/math', import.meta.url)),
      '@config': fileURLToPath(new URL('../../packages/ashfall-math/src/config', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
