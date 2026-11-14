import { defineConfig, devices } from '@playwright/test';

import { config as env } from './src/config/env';
import { USER_STORAGE_STATE } from './src/auth/storage-state';

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

  timeout: 45_000,
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
    // Deliberately `*-on-failure`, never `on`. Traces and videos contain auth
    // headers, cookies and typed form data, and CI artifacts on a public
    // repository are downloadable. See docs/adr/0007-secrets-in-test-artifacts.md
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    // Authorization and configuration are framework concerns, resolved here once
    // per run — never inside an individual test.
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

    // API layer: no browser needed, talks to the API base URL.
    {
      name: 'api',
      testMatch: /tests\/api\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { baseURL: env.apiBaseUrl },
    },

    // UI layer: starts from the session produced by `setup`.
    {
      name: 'ui-chromium',
      testMatch: /tests\/ui\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: USER_STORAGE_STATE },
    },

    // Cross-layer journeys (e.g. book via UI, verify via API).
    {
      name: 'e2e-chromium',
      testMatch: /tests\/e2e\/.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: USER_STORAGE_STATE },
    },
  ],
});
