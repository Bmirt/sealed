import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@math': fileURLToPath(new URL('./src/math', import.meta.url)),
      '@config': fileURLToPath(new URL('./src/config', import.meta.url)),
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
});
