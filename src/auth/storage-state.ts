import fs from 'node:fs/promises';
import path from 'node:path';

import type { BrowserContextOptions } from '@playwright/test';

/**
 * Where authenticated session artifacts live. Git-ignored: these files contain
 * real session cookies and must never be committed.
 */
export const AUTH_DIR = path.resolve(process.cwd(), '.auth');

/** Storage state consumed by every authenticated UI project (see playwright.config.ts). */
export const USER_STORAGE_STATE = path.join(AUTH_DIR, 'user.json');

type StorageState = NonNullable<Exclude<BrowserContextOptions['storageState'], string>>;

/** A valid, explicitly anonymous session. Used to opt a test out of authentication. */
export const ANONYMOUS_STORAGE_STATE: StorageState = { cookies: [], origins: [] };

/**
 * Guarantees the storage-state file exists and is valid JSON before any UI
 * project starts.
 *
 * TODO(Phase 4): this writes a TEMPORARY anonymous placeholder session. It is
 * scaffolding, not the final behaviour — it exists so the suite runs end to end
 * before the real authentication mechanism has been observed. Phase 4 replaces
 * the placeholder with a genuine authenticated session produced by AuthManager.
 * Until then, UI projects run anonymously rather than crashing on a missing file.
 */
export async function ensureStorageStateFile(): Promise<void> {
  await fs.mkdir(AUTH_DIR, { recursive: true });

  try {
    const existing = await fs.readFile(USER_STORAGE_STATE, 'utf-8');
    JSON.parse(existing) as StorageState;
  } catch {
    await writeStorageState(ANONYMOUS_STORAGE_STATE);
  }
}

export async function writeStorageState(state: StorageState): Promise<void> {
  await fs.mkdir(AUTH_DIR, { recursive: true });
  await fs.writeFile(USER_STORAGE_STATE, JSON.stringify(state, null, 2), 'utf-8');
}
