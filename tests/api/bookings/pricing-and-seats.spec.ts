import { errorMessageOf, toAmount } from '@api/contracts/common.contract';
import { buildBookingPayload } from '@data/factories/booking.factory';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';

test.describe('AC2 — pricing and seat availability', { tag: '@AC2' }, () => {
  test(
    'the total price is the ticket price multiplied by the quantity',
    { tag: '@smoke' },
    async ({ resources }) => {
      const event = await resources.createEvent(buildEvent({ price: 250, totalSeats: 50 }));
      const unitPrice = toAmount(event.price);

      for (const quantity of [1, 2, 3, 10]) {
        const booking = await resources.createBooking(
          buildBookingPayload({ eventId: event.id, quantity }),
        );

        expect
          .soft(toAmount(booking.totalPrice), `total for ${quantity} ticket(s)`)
          .toBe(unitPrice * quantity);
      }
    },
  );

  test('booking decrements available seats by exactly the quantity', async ({ api, resources }) => {
    const event = await resources.createEvent(buildEvent({ totalSeats: 20 }));
    const quantity = 4;

    await resources.createBooking(buildBookingPayload({ eventId: event.id, quantity }));

    const after = await api.events.getById(event.id);
    expect(after.data?.availableSeats).toBe(event.availableSeats - quantity);
  });

  test('requesting more seats than remain is rejected, naming the shortfall', async ({
    api,
    resources,
  }) => {
    const event = await resources.createEvent(buildEvent({ totalSeats: 4 }));

    const result = await api.bookings.create(
      buildBookingPayload({ eventId: event.id, quantity: 5 }),
    );
    resources.trackBooking(result);

    expect(result.status).toBe(400);
    expect(errorMessageOf(result.body)).toBe('Only 4 seat(s) available, but 5 requested');
  });

  test('an event can be booked out exactly, then rejects further bookings', async ({
    api,
    resources,
  }) => {
    const event = await resources.createEvent(buildEvent({ totalSeats: 4 }));

    await resources.createBooking(buildBookingPayload({ eventId: event.id, quantity: 4 }));

    const soldOut = await api.events.getById(event.id);
    expect(soldOut.data?.availableSeats).toBe(0);

    const result = await api.bookings.create(
      buildBookingPayload({ eventId: event.id, quantity: 1 }),
    );
    resources.trackBooking(result);

    expect(result.status).toBe(400);
    expect(errorMessageOf(result.body)).toBe('Only 0 seat(s) available, but 1 requested');
  });

  test('two simultaneous bookings for the last seat: exactly one succeeds', async ({
    api,
    resources,
  }) => {
    // The docs claim booking is atomic ("seats are decremented in the same
    // database transaction"). This is the test of that claim. A one-seat event we
    // own makes it deterministic: whatever the ordering, exactly one request must
    // win and the other must be told no seats remain.
    //
    // No retry and no skip: if this is intermittent, that IS the finding — an
    // overselling race — and it is reported as an application defect.
    const event = await resources.createEvent(buildEvent({ totalSeats: 1 }));

    const [first, second] = await Promise.all([
      api.bookings.create(buildBookingPayload({ eventId: event.id, quantity: 1 })),
      api.bookings.create(buildBookingPayload({ eventId: event.id, quantity: 1 })),
    ]);

    resources.trackBooking(first);
    resources.trackBooking(second);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    const created = statuses.filter((status) => status === 201);

    expect(
      created,
      `exactly one of the two concurrent bookings must succeed; got statuses ${JSON.stringify(statuses)}. ` +
        'Two 201s would mean the event was oversold.',
    ).toHaveLength(1);

    expect(statuses).toEqual([201, 400]);

    // The seat count must reflect one booking, never two.
    const after = await api.events.getById(event.id);
    expect(after.data?.availableSeats).toBe(0);
  });
});
