import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against a real stack: Postgres (docker compose db, reset before each run), the API
 * in mock mode, and the Vite dev server with the dev login switcher. They drive the Chrome that is
 * already installed (no browser download). Step 10 points the same specs at the full Compose stack.
 */
const API_ENV = {
  NODE_ENV: 'development',
  AUTH_PROVIDER: 'mock',
  ENABLE_DEV_ENDPOINTS: 'true',
  JWT_SECRET: 'e2e-only-secret-e2e-only-secret-e2e-only-secret',
  DATABASE_URL:
    process.env.E2E_DATABASE_URL ?? 'postgres://ql_app:ql_app_dev@localhost:5442/qualityloop',
  PORT: '3000',
  RATE_LIMIT_PER_MINUTE: '100000',
  RATE_LIMIT_LOGIN_PER_MINUTE: '1000',
};

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1, // the tests share one database and some of them change it
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome' } }],
  webServer: [
    {
      command: 'pnpm exec tsx src/server.ts',
      cwd: '../api',
      url: 'http://127.0.0.1:3000/healthz',
      env: API_ENV,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm exec vite --host 127.0.0.1 --port 5173',
      url: 'http://127.0.0.1:5173',
      env: { VITE_MOCK_AUTH: 'true' },
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
