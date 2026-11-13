import { defineConfig, devices } from '@playwright/test';

/**
 * Demo build tests: just the Vite dev server with VITE_DEMO=true. No API, no database, no Docker.
 * They also fail if the app tries to call the API at all (see e2e-demo/fixtures.ts).
 */
export default defineConfig({
  testDir: './e2e-demo',
  outputDir: './test-results-demo',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5174',
    url: 'http://127.0.0.1:5174',
    env: { VITE_DEMO: 'true' },
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
