import { defineConfig, devices } from '@playwright/test';

import { config as env } from './src/config/env';

/**
 * One config, one test runner, two layers (UI + API) separated by Playwright
 * projects. See docs/adr/ for the reasoning behind each choice below.
 */
export default defineConfig({
  testDir: './tests',

  // Tests must be independent, so they may run in any order, concurrently.
  fullyParallel: true,

  // A stray `test.only` must never silently shrink the CI suite.
  forbidOnly: env.isCI,

  // Deliberately zero. Retries hide real instability; we would rather fix the
  // test or report the product defect. Revisit only with evidence of genuine
  // third-party flakiness, and document it. See docs/adr/0005-reliability.md
  retries: 0,

  // EventHub is a shared public environment; we cap CI concurrency to stay a
  // polite API consumer and to reduce cross-test data interference.
  workers: env.isCI ? 2 : undefined,

  // Generous enough to absorb one slow API call against a shared third-party
  // server without masking a genuinely stuck test. See the timeout note in
  // src/auth/auth.manager.ts.
  timeout: 60_000,
  expect: { timeout: 10_000 },

  outputDir: 'test-results',

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    [
      'allure-playwright',
      {
        resultsDir: 'allure-results',
        detail: true,
        environmentInfo: {
          test_environment: env.environment,
          web_base_url: env.baseUrl,
          api_base_url: env.apiBaseUrl,
          node_version: process.version,
        },
      },
    ],
  ],

  use: {
    baseURL: env.baseUrl,
    // Slow the browser down so a headed run can be followed by eye.
    // `SLOW_MO=600 npm run test:headed` — 0 (no delay) unless asked for.
    launchOptions: { slowMo: Number(process.env.SLOW_MO ?? 0) },
    // Deliberately `*-on-failure`, never `on`. Traces and videos contain auth
    // headers, cookies and typed form data, and CI artifacts on a public
    // repository are downloadable. See docs/adr/0007-secrets-in-test-artifacts.md
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // UI actions stay tight: an action that cannot complete in 15s is a real
    // problem. API requests get their own, longer ceiling (auth.manager.ts).
    actionTimeout: 15_000,
    // Navigation is the one step that depends on the shared host serving a full
    // Next.js page — HTML plus every chunk. Measured in isolation the host is
    // fast (HTML p50 209ms), but under two concurrent browsers a full load
    // occasionally stalls past 30s. That figure was ours, not a requirement; a
    // too-tight navigation timeout manufactures failures that look like defects.
    navigationTimeout: 45_000,
  },

  projects: [
    // Preflight: configuration validity, API reachability and that every pooled
    // account can authenticate. One legible failure instead of 32 confusing ones.
    {
      name: 'setup',
      testMatch: /tests\/setup\/.*\.setup\.ts/,
      // The most secret-dense step in the run: a password is submitted and a
      // token is issued. We capture no trace and no video here so neither can
      // end up in a downloadable artifact. Failures stay diagnosable through
      // the redacting logger and a failure screenshot.
      // See docs/adr/0007-secrets-in-test-artifacts.md
      use: { trace: 'off', video: 'off' },
    },

    // Pure unit tests: no browser, no network, no session. Deliberately has no
    // `setup` dependency so it stays fast and runs even if the API is down.
    {
      name: 'unit',
      testMatch: /tests\/unit\/.*\.spec\.ts/,
    },

    // API layer: no browser needed, talks to the API base URL.
    {
      name: 'api',
      testMatch: /tests\/api\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { baseURL: env.apiBaseUrl },
    },

    // UI layer. Authentication is NOT configured here: `storageState` is a
    // test-scoped option, so it cannot vary per worker from a project. The
    // fixture layer overrides it from a worker-scoped session instead, which is
    // what lets each worker act as its own pooled account (ADR 0004 / 0008).
    {
      name: 'ui-chromium',
      testMatch: /tests\/ui\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },

    // Cross-layer journeys (e.g. book via API, verify in the UI).
    {
      name: 'e2e-chromium',
      testMatch: /tests\/e2e\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
