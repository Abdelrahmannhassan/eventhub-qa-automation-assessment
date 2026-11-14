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

  /** Remove every tracked resource. Safe to call more than once. */
  async cleanupAll(): Promise<CleanupResult[]> {
    const pending = this.tasks.splice(0).reverse();
    const results: CleanupResult[] = [];

    for (const { label, remove } of pending) {
      try {
        await remove();
        results.push({ label, status: 'succeeded' });
        this.log.debug('Cleaned up resource', { label });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({ label, status: 'failed', error: message });
        this.log.warn('Failed to clean up resource — manual removal may be required', {
          label,
          error: message,
        });
      }
    }

    return results;
  }
}
