import { test as base, expect } from '@playwright/test';

import { createApiClients } from '@api/clients';
import type { ApiClients } from '@api/clients';
import { authManager } from '@auth/auth.manager';
import type { Session } from '@auth/auth.manager';
import { foreignAccount, workerAccount } from '@auth/accounts';
import { buildStorageState, storageStatePathFor, writeStorageState } from '@auth/storage-state';
import { logger } from '@core/logger';
import { ResourceTracker } from '@support/cleanup/resource-tracker';
import { TestResources } from '@support/cleanup/test-resources';
import { EventDetailsPage, EventsPage, LoginPage, MyBookingsPage } from '@ui/pages';

export { expect };
export { ANONYMOUS_STORAGE_STATE } from '@auth/storage-state';

interface WorkerFixtures {
  /** The account this worker acts as. One sign-in serves every test on the worker. */
  workerSession: Session;
  /** Session for the foreign account, used only to attempt unauthorized access. */
  foreignSession: Session;
  /** Path to this worker's storage-state file, consumed by `storageState` below. */
  workerStorageState: string;
}

interface TestFixtures {
  /** API clients acting as the worker's account. */
  api: ApiClients;
  /** API clients acting as a different account, for authorization tests. */
  foreignApi: ApiClients;
  /** API clients with no credentials, for the `401` cases. */
  anonymousApi: ApiClients;
  /** Resources created by this test; removed automatically on teardown. */
  tracker: ResourceTracker;
  /** Creates resources and guarantees cleanup registration even on failure. */
  resources: TestResources;
  loginPage: LoginPage;
  eventsPage: EventsPage;
  eventDetailsPage: EventDetailsPage;
  myBookingsPage: MyBookingsPage;
}

const log = logger.child('fixtures');

export const test = base.extend<TestFixtures, WorkerFixtures>({
  // ---------------------------------------------------------------- worker scope
  workerSession: [
    async ({}, use, workerInfo) => {
      const { key, credentials } = workerAccount(workerInfo.parallelIndex);
      log.info('Worker signing in', { worker: workerInfo.parallelIndex, account: key });
      await use(await authManager.signIn(credentials));
    },
    { scope: 'worker' },
  ],

  /**
   * Writes the worker's session into a Playwright storage-state file — with the
   * JWT placed in `localStorage.eventhub_token`, exactly where the application
   * looks for it. No browser login happens anywhere in this suite.
   */
  workerStorageState: [
    async ({ workerSession }, use, workerInfo) => {
      const filePath = storageStatePathFor(workerInfo.parallelIndex);
      await writeStorageState(filePath, buildStorageState(workerSession));
      await use(filePath);
    },
    { scope: 'worker' },
  ],

  foreignSession: [
    async ({}, use) => {
      await use(await authManager.signIn(foreignAccount().credentials));
    },
    { scope: 'worker' },
  ],

  // ------------------------------------------------------------------ test scope
  /**
   * Overriding Playwright's own `storageState` option is what makes per-worker
   * authentication possible: the option is test-scoped, so it cannot vary by
   * worker on its own — it has to derive from a worker-scoped fixture.
   *
   * A test needing an anonymous browser overrides this visibly with
   * `test.use({ storageState: ANONYMOUS_STORAGE_STATE })`.
   */
  storageState: async ({ workerStorageState }, use) => {
    await use(workerStorageState);
  },

  /**
   * Request contexts are **test-scoped**, while the sign-in that produces the
   * token stays worker-scoped. So there is still one login per worker, but no
   * long-lived HTTP connection.
   *
   * This was a root-cause fix, not a preference. A worker-scoped context reuses
   * keep-alive sockets for the whole worker run, and the server (Apache) closes
   * idle connections on its own schedule — so a later request would occasionally
   * reuse a socket the server had already dropped and fail with `ECONNRESET`.
   * It reproduced in roughly half of CI-mode runs, always on a test late in a
   * worker's queue. A fresh context per test removes the stale-socket window
   * instead of retrying through it (ADR 0005).
   */
  api: async ({ workerSession }, use) => {
    const context = await authManager.createApiContext(workerSession);
    await use(createApiClients(context));
    await context.dispose();
  },

  foreignApi: async ({ foreignSession }, use) => {
    const context = await authManager.createApiContext(foreignSession);
    await use(createApiClients(context));
    await context.dispose();
  },

  anonymousApi: async ({}, use) => {
    const context = await authManager.createAnonymousApiContext();
    await use(createApiClients(context));
    await context.dispose();
  },

  /**
   * Cleanup runs here rather than in each test, so a test cannot forget it and
   * cannot leave data behind when it fails mid-way.
   */
  /**
   * Depends on `api` deliberately: cleanup callbacks use the API clients, and a
   * fixture's dependencies are torn down *after* it. That ordering guarantees the
   * request context is still alive while teardown runs.
   */
  // `api` is destructured (and renamed) purely to declare the dependency:
  // Playwright reads the property name, and a fixture's dependencies are torn
  // down *after* it, which keeps the request context alive during cleanup.
  tracker: async ({ api: _api }, use, testInfo) => {
    const tracker = new ResourceTracker();
    await use(tracker);

    const results = await tracker.cleanupAll();
    const failed = results.filter((result) => result.status === 'failed');

    if (failed.length > 0) {
      // Reported, never thrown: a cleanup failure must not mask the real result,
      // but it must be visible in the report.
      testInfo.annotations.push({
        type: 'cleanup-failed',
        description: failed.map((result) => `${result.label}: ${result.error}`).join('; '),
      });
    }
  },

  resources: async ({ api, tracker }, use) => {
    await use(new TestResources(api, tracker));
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  eventsPage: async ({ page }, use) => {
    await use(new EventsPage(page));
  },

  eventDetailsPage: async ({ page }, use) => {
    await use(new EventDetailsPage(page));
  },

  myBookingsPage: async ({ page }, use) => {
    await use(new MyBookingsPage(page));
  },
});
