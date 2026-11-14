import { request } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

import { AuthClient } from '@api/clients';
import type { Credentials } from '@api/contracts/auth.contract';
import { config } from '@config/env';
import { logger } from '@core/logger';

/**
 * API requests are network calls to a shared third-party server, so they get a
 * more generous ceiling than UI actions.
 *
 * Measured in Phase 6b: login latency is p50 381ms / p90 850ms over 20 samples,
 * and 60 sequential requests produced nothing above 3s. But a Playwright
 * `APIRequestContext` request occasionally stalled past the 15s `actionTimeout`
 * (roughly 1 run in 8). That 15s figure was an arbitrary choice of ours, and a
 * too-tight timeout manufactures failures that look like product defects. This
 * raises the ceiling; it does not retry anything (ADR 0005).
 */
const API_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Headers applied to every API context.
 *
 * `Connection: close` disables HTTP keep-alive, so each request opens its own
 * connection instead of reusing a pooled one.
 *
 * Why: the suite's remaining intermittent failure was `ECONNRESET` on the first
 * API call made *after* a long UI interlude in the same test — the classic
 * symptom of a pooled connection the server has already dropped. It reproduced
 * on GitHub's runners as well as locally, so it is not a local-network artifact.
 * Ruled out beforehand: server health (sequential p50 209-587ms; 12 parallel
 * reads all 200 in ~1s), concurrency (2 workers fared worse than 7), and a plain
 * idle gap (a 20s idle context reuses fine when nothing else is in flight).
 * What the failing case adds is heavy *browser* traffic to the same host during
 * the gap.
 *
 * Removing connection reuse removes the failure mode rather than retrying
 * through it (ADR 0005). Cost is one TCP+TLS handshake per request — measured at
 * roughly 400ms, against ~100 API calls in a full run.
 */
const NO_CONNECTION_REUSE = { Connection: 'close' } as const;

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

    const context = await request.newContext({
      baseURL: config.apiBaseUrl,
      timeout: API_REQUEST_TIMEOUT_MS,
      extraHTTPHeaders: { ...NO_CONNECTION_REUSE },
    });

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
      timeout: API_REQUEST_TIMEOUT_MS,
      extraHTTPHeaders: {
        Authorization: `Bearer ${session.token}`,
        ...NO_CONNECTION_REUSE,
      },
    });
  }

  /** An API context with no credentials, for the `401` negative cases. */
  async createAnonymousApiContext(): Promise<APIRequestContext> {
    return request.newContext({
      baseURL: config.apiBaseUrl,
      timeout: API_REQUEST_TIMEOUT_MS,
      extraHTTPHeaders: { ...NO_CONNECTION_REUSE },
    });
  }
}

export const authManager = new AuthManager();
