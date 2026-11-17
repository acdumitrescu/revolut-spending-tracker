import { defineConfig, devices } from '@playwright/test';
import { E2E_BASE_URL, E2E_SYNC_TOKEN } from './e2e/config.js';

// Real-browser journeys in Chromium and WebKit (Safari's engine).
export default defineConfig({
  testDir: './e2e',
  // One shared backend; journeys create their own users, so run them one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: E2E_BASE_URL,
    // The server token, sent the way the trusted local proxy sends it.
    extraHTTPHeaders: { Authorization: `Bearer ${E2E_SYNC_TOKEN}` },
    trace: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1320, height: 860 } },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1320, height: 860 } },
    },
  ],
  webServer: {
    command: 'node scripts/e2e/server.mjs',
    url: `${E2E_BASE_URL}/healthz`,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
