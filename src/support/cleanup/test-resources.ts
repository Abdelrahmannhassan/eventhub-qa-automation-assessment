import type { ApiClients, ApiResult } from '@api/clients';
import type { Booking, CreateBookingPayload } from '@api/contracts/booking.contract';
import type { CreateEventPayload, Event } from '@api/contracts/event.contract';
import { logger } from '@core/logger';

import type { ResourceTracker } from './resource-tracker';

/** Pull an `id` out of a raw `{ success, data: { id } }` body without trusting its shape. */
function idFromBody(body: unknown): number | undefined {
  if (typeof body !== 'object' || body === null) return undefined;

  const data = (body as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return undefined;

  const id = (data as { id?: unknown }).id;
  return typeof id === 'number' ? id : undefined;
}

/**
 * Creates resources **and guarantees they are registered for cleanup**, even if
 * the response then fails contract validation.
 *
 * This exists because of a real leak observed in Phase 6a: a `POST /events`
 * returned `201`, the strict contract rejected the body, the client threw, and
 * the tracking call that followed never ran — leaving an orphan event on a
 * shared public environment. Registering from the raw body, before anything can
 * throw, removes that whole class of failure.
 */
export class TestResources {
  private readonly log = logger.child('TestResources');

  constructor(
    private readonly api: ApiClients,
    private readonly tracker: ResourceTracker,
  ) {}

  /** Registers an event for removal based on the raw body. Safe to call always. */
  trackEvent(result: ApiResult<Event>): void {
    const id = idFromBody(result.body);

    if (id === undefined) {
      this.log.debug('No event id in response body; nothing to track', { status: result.status });
      return;
    }

    this.tracker.track(`event ${id}`, async () => {
      await this.api.events.remove(id);
    });
  }

  /** Registers a booking for removal based on the raw body. Safe to call always. */
  trackBooking(result: ApiResult<Booking>): void {
    const id = idFromBody(result.body);

    if (id === undefined) {
      this.log.debug('No booking id in response body; nothing to track', { status: result.status });
      return;
    }

    this.tracker.track(`booking ${id}`, async () => {
      await this.api.bookings.cancel(id);
    });
  }

  /**
   * Arrange step: create an event the test owns outright, so price and seat
   * assertions are deterministic rather than dependent on shared inventory.
   */
  async createEvent(payload: CreateEventPayload): Promise<Event> {
    const result = await this.api.events.create(payload);
    this.trackEvent(result);

    const event = result.data;

    if (!event) {
      throw new Error(
        `Could not create the test event: HTTP ${result.status} ${JSON.stringify(result.body)}`,
      );
    }

    return event;
  }

  /** Arrange step: a booking created as a precondition rather than under test. */
  async createBooking(payload: CreateBookingPayload): Promise<Booking> {
    const result = await this.api.bookings.create(payload);
    this.trackBooking(result);

    const booking = result.data;

    if (!booking) {
      throw new Error(
        `Could not create the test booking: HTTP ${result.status} ${JSON.stringify(result.body)}`,
      );
    }

    return booking;
  }

  /**
   * Track a booking discovered by reference — used after the UI creates one,
   * where the test never sees a response body. Registration is synchronous; the
   * lookup happens at teardown.
   */
  trackBookingByRef(ref: string): void {
    this.tracker.track(`booking ref ${ref}`, async () => {
      const found = await this.api.bookings.getByRef(ref);
      const booking = found.data;

      if (booking) {
        await this.api.bookings.cancel(booking.id);
      }
    });
  }
}
