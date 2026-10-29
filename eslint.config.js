import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist', 'node_modules', 'docs', 'dev-assets', 'test-results', 'playwright-report', '.wrangler'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['*.config.{js,ts}', 'scripts/**', 'tests/**', 'e2e/**'],
    languageOptions: { globals: { ...globals.node } },
  },
);
