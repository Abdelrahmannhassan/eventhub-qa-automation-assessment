import { request } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { AuthClient } from '@api/clients';
import type { Credentials } from '@api/contracts/auth.contract';
import { config } from '@config/env';
import { logger } from '@core/logger';

export interface Session {
  token: string;
  userId: number;
  email: string;
}

/**
 * The single place in the codebase where credentials become a session (ADR 0004).
 *
 * No test logs in. Tests receive the *result* — an authenticated API context or a
 * pre-populated browser session — through fixtures.
 *
 * Phase 2 made this simple: the web app keeps its JWT in
 * `localStorage.eventhub_token` and the API accepts the same token as a bearer
 * header, so one HTTP login serves both layers and no browser login is needed.
 */
export class AuthManager {
  private static readonly cache = new Map<string, Session>();
  private readonly log = logger.child('AuthManager');

  /** Sessions are cached per email so one worker logs in at most once per account. */
  async signIn(credentials: Credentials): Promise<Session> {
    const cached = AuthManager.cache.get(credentials.email);

    if (cached) {
      this.log.debug('Reusing cached session', { email: credentials.email });
      return cached;
    }

    const context = await request.newContext({ baseURL: config.apiBaseUrl });

    try {
      const session = await this.login(context, credentials);
      AuthManager.cache.set(credentials.email, session);
      return session;
    } finally {
      await context.dispose();
    }
  }

  private async login(context: APIRequestContext, credentials: Credentials): Promise<Session> {
    const result = await new AuthClient(context).login(credentials);

    if (!result.data) {
      throw new Error(
        `Sign-in failed for ${credentials.email}: HTTP ${result.status} ` +
          `${JSON.stringify(result.body)}. Check the pooled account credentials ` +
          `(see docs/adr/0008-test-account-strategy.md).`,
      );
    }

    this.log.info('Signed in', { email: credentials.email, userId: result.data.user.id });

    return {
      token: result.data.token,
      userId: result.data.user.id,
      email: result.data.user.email,
    };
  }

  /**
   * Builds an API context that carries the bearer token on every request, so no
   * test and no client ever handles a token itself.
   */
  async createApiContext(session: Session): Promise<APIRequestContext> {
    return request.newContext({
      baseURL: config.apiBaseUrl,
      extraHTTPHeaders: { Authorization: `Bearer ${session.token}` },
    });
  }

  /** An API context with no credentials, for the `401` negative cases. */
  async createAnonymousApiContext(): Promise<APIRequestContext> {
    return request.newContext({ baseURL: config.apiBaseUrl });
  }
}

export const authManager = new AuthManager();
