import { config } from '@config/env';
import type { Credentials } from '@api/contracts/auth.contract';

/**
 * The account pool (ADR 0008).
 *
 * Accounts cannot be deleted through the API, so registering a fresh one per run
 * would leak permanently on a shared public environment. Instead a fixed pool is
 * supplied through configuration.
 */
export type WorkerAccountKey = 'a' | 'b';
export type ForeignAccountKey = 'c';
export type AccountKey = WorkerAccountKey | ForeignAccountKey;

/** Acting users. One per Playwright worker, assigned by worker index. */
const WORKER_ACCOUNT_KEYS: readonly WorkerAccountKey[] = ['a', 'b'];

/**
 * The "foreign" actor. Used **only** to attempt unauthorized reads and cancels,
 * so it creates nothing and every worker can share it without interference.
 */
const FOREIGN_ACCOUNT_KEY: ForeignAccountKey = 'c';

export const WORKER_ACCOUNT_COUNT = WORKER_ACCOUNT_KEYS.length;

function resolve(key: AccountKey): Credentials {
  const account = config.accounts[key];
  const upper = key.toUpperCase();

  if (!account.email || !account.password) {
    throw new Error(
      `EventHub account ${upper} is not configured. Set TEST_USER_${upper}_EMAIL and ` +
        `TEST_USER_${upper}_PASSWORD in your .env (locally) or as GitHub Actions secrets ` +
        `(CI). See .env.example, README.md and docs/adr/0008-test-account-strategy.md.`,
    );
  }

  return { email: account.email, password: account.password };
}

/**
 * Deterministic account for a worker. Wrapping modulo keeps the suite runnable
 * when workers outnumber pooled accounts — at the cost of sharing, which is safe
 * because assertions are presence-based and each test owns its own event.
 */
export function workerAccount(parallelIndex: number): {
  key: WorkerAccountKey;
  credentials: Credentials;
} {
  const key = WORKER_ACCOUNT_KEYS[parallelIndex % WORKER_ACCOUNT_COUNT] as WorkerAccountKey;
  return { key, credentials: resolve(key) };
}

export function foreignAccount(): { key: ForeignAccountKey; credentials: Credentials } {
  return { key: FOREIGN_ACCOUNT_KEY, credentials: resolve(FOREIGN_ACCOUNT_KEY) };
}

export function allPooledAccountKeys(): AccountKey[] {
  return [...WORKER_ACCOUNT_KEYS, FOREIGN_ACCOUNT_KEY];
}

export function accountCredentials(key: AccountKey): Credentials {
  return resolve(key);
}
