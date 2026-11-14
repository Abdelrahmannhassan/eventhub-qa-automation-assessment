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
 * PHASE 2 will add the real session acquisition here (register/login against the
 * actual application). It is intentionally NOT implemented yet: the authentication
 * mechanism has not been explored, and inventing endpoints would be guesswork.
 */
setup('resolve configuration and prepare session artifact', async () => {
  log.info('Resolved test configuration', {
    environment: config.environment,
    baseUrl: config.baseUrl,
    apiBaseUrl: config.apiBaseUrl,
    isCI: config.isCI,
    hasSharedAccountCredentials: Boolean(config.credentials.email && config.credentials.password),
  });

  await ensureStorageStateFile();

  log.info('Session artifact ready', { path: USER_STORAGE_STATE });
});
