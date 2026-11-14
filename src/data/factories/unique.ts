import crypto from 'node:crypto';

/**
 * Short, collision-resistant suffix. Unique data per test is what makes
 * `fullyParallel` safe on an environment other people are also using.
 */
export function uniqueSuffix(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}
