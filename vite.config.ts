import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset URLs: the same dist/ works at a subdomain root, under a subpath or on any static host.
  base: './',
  build: {
    target: 'es2022',
    // Never inline fonts or images as data: URIs; the CSP allows fonts from 'self' only.
    assetsInlineLimit: 0,
    sourcemap: true,
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
