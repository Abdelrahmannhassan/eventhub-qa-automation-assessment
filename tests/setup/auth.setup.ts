import { test as setup, expect } from '@playwright/test';

import { AuthClient } from '@api/clients';
import { accountCredentials, allPooledAccountKeys } from '@auth/accounts';
import { authManager } from '@auth/auth.manager';
import { config } from '@config/env';
import { logger } from '@core/logger';

const log = logger.child('setup');

/**
 * Preflight. Runs once before every other project (`dependencies: ['setup']`).
 *
 * It deliberately does **not** produce the session the tests use — that is
 * worker-scoped, because each worker signs in as a different pooled account
 * (ADR 0008), and a project-level artifact cannot vary per worker.
 *
 * What it does instead is fail fast and legibly: if a credential is wrong or the
 * API is down, you get one clearly named failure here rather than 32 confusing
 * ones downstream.
 */
setup('API is reachable', async () => {
  const context = await authManager.createAnonymousApiContext();

  try {
    const response = await context.get('/api/health');
    expect(response.status(), 'GET /api/health should be reachable without auth').toBe(200);
    log.info('API healthy', { body: (await response.json()) as unknown });
  } finally {
    await context.dispose();
  }
});

setup('every pooled account can authenticate', async () => {
  log.info('Resolved configuration', {
    environment: config.environment,
    baseUrl: config.baseUrl,
    apiBaseUrl: config.apiBaseUrl,
    isCI: config.isCI,
  });

  for (const key of allPooledAccountKeys()) {
    const session = await authManager.signIn(accountCredentials(key));

    const context = await authManager.createApiContext(session);
    try {
      const me = await new AuthClient(context).me();
      expect(me.data?.user.userId, `account ${key.toUpperCase()} should resolve its identity`).toBe(
        session.userId,
      );
    } finally {
      await context.dispose();
    }

    log.info('Account verified', { account: key, userId: session.userId });
  }
});
