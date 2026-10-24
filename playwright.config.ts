import { defineConfig, devices } from '@playwright/test';

const viewport = { width: 1440, height: 900 };

/** Point the suite at an already running server instead, e.g. the Vite dev server: E2E_BASE_URL=http://127.0.0.1:5173 */
const external = process.env.E2E_BASE_URL;

/**
 * End-to-end tests run against the production build served by `wrangler dev`, which applies public/_headers,
 * so the CSP is exercised too. `npm run e2e` builds first. The stress run is opt-in: STRESS=1 npm run e2e.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: external ?? 'http://127.0.0.1:8787',
    acceptDownloads: true,
    viewport,
  },
  projects: process.env.STRESS
    ? [{ name: 'stress', use: { ...devices['Desktop Chrome'], viewport }, grep: /@stress/, timeout: 15 * 60_000 }]
    : [
        { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport }, grepInvert: /@stress/ },
        { name: 'webkit', use: { ...devices['Desktop Safari'], viewport }, grep: /@smoke/ },
      ],
  webServer: external
    ? undefined
    : {
        command: 'npx wrangler dev --port 8787 --ip 127.0.0.1',
        url: 'http://127.0.0.1:8787',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { WRANGLER_SEND_METRICS: 'false' },
      },
});
