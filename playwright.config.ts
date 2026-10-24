import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;
// `npm run test:e2e:prod` sets E2E_PROD=1: build first, then run against `next start` (the real
// production server, minified bundles, no Strict Mode double effects, no dev-only styleguide).
const server = process.env.E2E_PROD ? 'start' : 'dev';

export default defineConfig({
  testDir: './tests/e2e',
  // Parallel agents / CI jobs set PW_OUTPUT_DIR so their traces and screenshots do not collide.
  outputDir: process.env.PW_OUTPUT_DIR ?? './test-results',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  // One worker: the specs share one database and several change global state on purpose (the coach
  // spec renames the Persian name of "Barbell bench press" and edits the settings while the training
  // spec searches for that exercise by name). Spec files in two workers race on that state.
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    // Chromium is preinstalled; never run `playwright install`.
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npm run ${server} -- -p ${port}`,
        url: `${baseURL}/fa/login`,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
