import path from 'node:path';

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ path: path.resolve(process.cwd(), '.env'), quiet: true });

/**
 * Known target environments.
 *
 * EventHub currently exposes a single shared public environment. Keeping it in a
 * map (rather than hardcoding URLs) means adding a staging target later is a
 * one-line change and every consumer keeps reading `config.baseUrl`.
 */
const ENVIRONMENT_URLS = {
  production: {
    baseUrl: 'https://eventhub.rahulshettyacademy.com',
    apiBaseUrl: 'https://api.eventhub.rahulshettyacademy.com',
  },
} as const;

export type TestEnvironmentName = keyof typeof ENVIRONMENT_URLS;

/** Treat an unset-or-empty env var as absent, so `FOO=` in .env behaves like no FOO. */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value));

/**
 * An optional URL that treats an empty value as absent.
 *
 * This matters in CI: an unreferenced GitHub Actions variable expands to an
 * **empty string**, not to nothing. A bare `z.url().optional()` would reject
 * that and fail the whole run on a missing optional override.
 */
const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === '' ? undefined : value))
  .refine((value) => value === undefined || URL.canParse(value), 'must be a valid URL');

const envSchema = z.object({
  TEST_ENV: z.enum(Object.keys(ENVIRONMENT_URLS) as [TestEnvironmentName]).default('production'),
  BASE_URL: optionalUrl,
  API_BASE_URL: optionalUrl,
  // Two throwaway accounts. Confirmed in Phase 2: registration needs no email
  // verification, so accounts are cheap and disposable (docs/api-findings.md §1).
  // Account B exists to prove cross-account isolation, which the API enforces.
  TEST_USER_A_EMAIL: optionalString,
  TEST_USER_A_PASSWORD: optionalString,
  TEST_USER_B_EMAIL: optionalString,
  TEST_USER_B_PASSWORD: optionalString,
  // Account C is the "foreign" actor: it only ever attempts unauthorized access,
  // so it creates nothing and every worker can share it safely (ADR 0008).
  TEST_USER_C_EMAIL: optionalString,
  TEST_USER_C_PASSWORD: optionalString,
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');

  throw new Error(
    `Invalid test configuration. Fix your environment (see .env.example):\n${issues}`,
  );
}

const raw = parsed.data;
const defaults = ENVIRONMENT_URLS[raw.TEST_ENV];

/**
 * The single source of truth for runtime configuration.
 *
 * Resolution order: explicit env var -> environment default. Nothing in the
 * framework reads `process.env` directly; everything imports this object. That
 * keeps configuration validated in one place and testable.
 */
export const config = {
  environment: raw.TEST_ENV,
  baseUrl: (raw.BASE_URL ?? defaults.baseUrl).replace(/\/+$/, ''),
  apiBaseUrl: (raw.API_BASE_URL ?? defaults.apiBaseUrl).replace(/\/+$/, ''),
  logLevel: raw.LOG_LEVEL,
  isCI: Boolean(process.env.CI),
  accounts: {
    a: { email: raw.TEST_USER_A_EMAIL, password: raw.TEST_USER_A_PASSWORD },
    b: { email: raw.TEST_USER_B_EMAIL, password: raw.TEST_USER_B_PASSWORD },
    c: { email: raw.TEST_USER_C_EMAIL, password: raw.TEST_USER_C_PASSWORD },
  },
} as const;

export type AccountKey = keyof TestConfig['accounts'];

export type TestConfig = typeof config;

/**
 * Credentials are optional at load time (a suite may register its own account),
 * but when a test genuinely needs a pre-provisioned account we want an
 * actionable error instead of an unexplained 401 deep inside a request.
 */
export function requireAccount(which: AccountKey): { email: string; password: string } {
  const { email, password } = config.accounts[which];
  const key = which.toUpperCase();

  if (!email || !password) {
    throw new Error(
      `This test requires EventHub account ${key}. Set TEST_USER_${key}_EMAIL and ` +
        `TEST_USER_${key}_PASSWORD in your .env (locally) or as GitHub Actions secrets ` +
        `(CI). See .env.example and README.md.`,
    );
  }

  return { email, password };
}
