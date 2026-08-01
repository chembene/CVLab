import { defineConfig, devices } from '@playwright/test';

/**
 * E2E foundation. `npm run test:e2e -w @cvlab/web` starts the dev server and
 * runs the spec(s) in ./e2e against it. Requires a one-time browser install
 * (`npx playwright install chromium`) which is not run automatically as part
 * of `npm install` — see README "Testing" section.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
