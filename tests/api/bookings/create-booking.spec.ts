import { BOOKING_REF_PATTERN } from '@api/contracts/booking.contract';
import { toAmount } from '@api/contracts/common.contract';
import { buildBookingPayload } from '@data/factories/booking.factory';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';

test.describe('AC1 — create a booking through the API', { tag: ['@AC1', '@smoke'] }, () => {
  test('a booking is created with a reference, the acting user and the correct total', async ({
    api,
    resources,
    workerSession,
  }) => {
    // Own event, so price and seat count are ours to assert against. The shared
    // static events lose seats to other users mid-run.
    const event = await resources.createEvent(buildEvent({ price: 250, totalSeats: 20 }));

    const quantity = 3;
    const payload = buildBookingPayload({ eventId: event.id, quantity });

    // `POST /bookings` is the behaviour under test, so it is called directly
    // rather than through the arrange helper.
    const result = await api.bookings.create(payload);

    // Registered before anything can throw: a contract failure must not leak a
    // booking that the server already created.
    resources.trackBooking(result);

    expect(result.status).toBe(201);

    // Reading `result.data` validates the response against its Zod contract.
    const booking = result.data;
    expect(booking, `booking creation failed: ${JSON.stringify(result.body)}`).toBeDefined();

    expect(booking!.bookingRef).toMatch(BOOKING_REF_PATTERN);
    expect(booking!.status).toBe('confirmed');
    expect(booking!.quantity).toBe(quantity);
    expect(booking!.eventId).toBe(event.id);

    // The booking belongs to the authenticated account, not to the email in the
    // payload — the ambiguity raised as gap G3 in the story review.
    expect(booking!.userId).toBe(workerSession.userId);

    expect(toAmount(booking!.totalPrice)).toBe(toAmount(event.price) * quantity);
  });
});
