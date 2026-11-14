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

const envSchema = z.object({
  TEST_ENV: z.enum(Object.keys(ENVIRONMENT_URLS) as [TestEnvironmentName]).default('production'),
  BASE_URL: z.url().optional(),
  API_BASE_URL: z.url().optional(),
  TEST_USER_EMAIL: optionalString,
  TEST_USER_PASSWORD: optionalString,
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
  credentials: {
    email: raw.TEST_USER_EMAIL,
    password: raw.TEST_USER_PASSWORD,
  },
} as const;

export type TestConfig = typeof config;

/**
 * Credentials are optional at load time (many suites create their own users),
 * but when a suite genuinely needs the shared account we want an actionable
 * error instead of an unexplained 401 deep inside a request.
 */
export function requireSharedAccountCredentials(): { email: string; password: string } {
  const { email, password } = config.credentials;

  if (!email || !password) {
    throw new Error(
      'This test requires the shared EventHub account. Set TEST_USER_EMAIL and ' +
        'TEST_USER_PASSWORD in your .env (locally) or as GitHub Actions secrets (CI). ' +
        'See .env.example and README.md.',
    );
  }

  return { email, password };
}
