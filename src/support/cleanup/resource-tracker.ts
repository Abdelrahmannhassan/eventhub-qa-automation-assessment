import { logger } from '@core/logger';

export interface CleanupResult {
  label: string;
  status: 'succeeded' | 'failed';
  error?: string;
}

/**
 * Registry of resources a test created, so they can be removed afterwards.
 *
 * EventHub is a shared public environment and the assessment explicitly asks us
 * to clean up after ourselves. Two design choices matter:
 *
 *  1. LIFO order — dependents are removed before the things they depend on.
 *  2. Failures are isolated and reported, never thrown. A cleanup error must not
 *     mask the real test result, but it must also not be swallowed silently.
 */
export class ResourceTracker {
  private readonly tasks: Array<{ label: string; remove: () => Promise<void> }> = [];
  private readonly log = logger.child('ResourceTracker');

  /** Register a resource for removal. Call immediately after creating it. */
  track(label: string, remove: () => Promise<void>): void {
    this.log.debug('Tracking resource for cleanup', { label });
    this.tasks.push({ label, remove });
  }

  get size(): number {
    return this.tasks.length;
  }

  /**
   * One retry, and only for cleanup.
   *
   * This is **not** a test retry and does not contradict ADR 0005: it cannot make
   * an assertion pass, because teardown runs after the verdict is decided. It
   * exists because the shared environment produced a real transient
   * `ECONNRESET` on a `DELETE` during Phase 6a, and an un-deleted booking is
   * litter on a server we do not own. A failure after the retry is still
   * reported, never swallowed.
   */
  private async removeWithOneRetry(
    label: string,
    remove: () => Promise<void>,
  ): Promise<string | undefined> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await remove();
        this.log.debug('Cleaned up resource', { label, attempt });
        return undefined;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (attempt === 2) {
          return message;
        }

        this.log.debug('Cleanup attempt failed; retrying once', { label, error: message });
      }
    }

    return undefined;
  }

  /** Remove every tracked resource. Safe to call more than once. */
  async cleanupAll(): Promise<CleanupResult[]> {
    const pending = this.tasks.splice(0).reverse();
    const results: CleanupResult[] = [];

    for (const { label, remove } of pending) {
      const error = await this.removeWithOneRetry(label, remove);

      if (error === undefined) {
        results.push({ label, status: 'succeeded' });
        continue;
      }

      results.push({ label, status: 'failed', error });
      this.log.warn('Failed to clean up resource — manual removal may be required', {
        label,
        error,
      });
    }

    return results;
  }
}
