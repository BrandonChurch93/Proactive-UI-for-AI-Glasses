import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  base: './',
  server: { port: 5173, strictPort: false, fs: { allow: [root] } },
  preview: { port: 4173 },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 2000 },
  css: { modules: { localsConvention: 'camelCaseOnly' } },
});
