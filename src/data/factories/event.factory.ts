import type { CreateEventPayload } from '@api/contracts/event.contract';

import { uniqueSuffix } from './unique';

/**
 * A valid-by-default event, overridable per test.
 *
 * Tests create their own event whenever price or seat count matters: the three
 * shared static events lose seats to other candidates mid-run, so asserting
 * arithmetic against them would be flaky by design (docs/test-strategy.md).
 *
 * `price` deliberately defaults to a round number so expected totals are obvious
 * in a failure message.
 */
export function buildEvent(overrides: Partial<CreateEventPayload> = {}): CreateEventPayload {
  const suffix = uniqueSuffix();

  return {
    title: `QA Automation Event ${suffix}`,
    description: 'Created by the automated test suite. Safe to delete.',
    category: 'Conference',
    venue: 'Automation Venue',
    city: 'Cairo',
    // Comfortably in the future, so the test is unaffected by the open question
    // about whether past events should be bookable (story-review.md S6).
    eventDate: '2027-06-01T10:00:00.000Z',
    price: 100,
    totalSeats: 50,
    ...overrides,
  };
}
