import { test as base, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

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
  /** Path to this worker's storage-state file, consumed by `storageState` below. */
  workerStorageState: string;
  /** Pre-authenticated API context for the worker's account. */
  workerApiContext: APIRequestContext;
  /** Pre-authenticated API context for the foreign account (creates nothing). */
  foreignApiContext: APIRequestContext;
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

  workerApiContext: [
    async ({ workerSession }, use) => {
      const context = await authManager.createApiContext(workerSession);
      await use(context);
      await context.dispose();
    },
    { scope: 'worker' },
  ],

  foreignApiContext: [
    async ({}, use) => {
      const session = await authManager.signIn(foreignAccount().credentials);
      const context = await authManager.createApiContext(session);
      await use(context);
      await context.dispose();
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

  api: async ({ workerApiContext }, use) => {
    await use(createApiClients(workerApiContext));
  },

  foreignApi: async ({ foreignApiContext }, use) => {
    await use(createApiClients(foreignApiContext));
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
  tracker: async ({}, use, testInfo) => {
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
