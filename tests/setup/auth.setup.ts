import { test as setup } from '@playwright/test';

import { config } from '@config/env';
import { logger } from '@core/logger';
import { ensureStorageStateFile, USER_STORAGE_STATE } from '@auth/storage-state';

const log = logger.child('setup');

/**
 * Runs once before every other project (see `dependencies` in playwright.config.ts).
 *
 * Responsibilities:
 *  1. Fail fast on invalid configuration — importing `config` validates it.
 *  2. Produce the storage-state artifact that authenticated UI projects consume.
 *
 * TODO(Phase 4): real session acquisition goes here (register/login against the
 * actual application via AuthManager). The current session artifact is a
 * TEMPORARY anonymous placeholder. It is intentionally not implemented yet: the
 * authentication mechanism is observed in Phase 2, and inventing endpoints
 * before that would be guesswork (CLAUDE.md §1).
 */
setup('resolve configuration and prepare session artifact', async () => {
  log.info('Resolved test configuration', {
    environment: config.environment,
    baseUrl: config.baseUrl,
    apiBaseUrl: config.apiBaseUrl,
    isCI: config.isCI,
    hasAccountA: Boolean(config.accounts.a.email && config.accounts.a.password),
    hasAccountB: Boolean(config.accounts.b.email && config.accounts.b.password),
  });

  await ensureStorageStateFile();

  log.info('Session artifact ready', { path: USER_STORAGE_STATE });
});
