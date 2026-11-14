import fs from 'node:fs/promises';
import path from 'node:path';

import type { BrowserContextOptions } from '@playwright/test';

import { config } from '@config/env';

import type { Session } from './auth.manager';

/**
 * Where authenticated session artifacts live. Git-ignored: these files contain a
 * real JWT and must never be committed, nor uploaded as a CI artifact (ADR 0007).
 */
export const AUTH_DIR = path.resolve(process.cwd(), '.auth');

type StorageState = NonNullable<Exclude<BrowserContextOptions['storageState'], string>>;

/** A valid, explicitly anonymous session. Used to opt a test out of authentication. */
export const ANONYMOUS_STORAGE_STATE: StorageState = { cookies: [], origins: [] };

/**
 * The localStorage key the web application reads its JWT from. Observed in
 * Phase 2 — the app uses no cookie session at all, which is why injecting
 * storage state is sufficient to sign the browser in.
 */
export const TOKEN_STORAGE_KEY = 'eventhub_token';

/** One file per worker, because each worker signs in as a different account. */
export function storageStatePathFor(workerIndex: number): string {
  return path.join(AUTH_DIR, `worker-${workerIndex}.json`);
}

/**
 * Turns a session into a browser session, with no browser involved.
 *
 * This is the whole trick behind "authorization is handled by the framework":
 * the token obtained over HTTP is written where the application expects to find
 * it, so every UI test opens an already-signed-in browser.
 */
export function buildStorageState(session: Session): StorageState {
  return {
    cookies: [],
    origins: [
      {
        origin: config.baseUrl,
        localStorage: [{ name: TOKEN_STORAGE_KEY, value: session.token }],
      },
    ],
  };
}

export async function writeStorageState(filePath: string, state: StorageState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
}
