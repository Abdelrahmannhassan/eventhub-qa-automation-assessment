import { BOOKING_REF_PATTERN } from '@api/contracts/booking.contract';
import { errorMessageOf, toAmount, validationFieldsOf } from '@api/contracts/common.contract';
import { buildBookingPayload } from '@data/factories/booking.factory';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';

test.describe('AC1 — create a booking through the API', { tag: '@AC1' }, () => {
  test(
    'a booking is created with a reference, the acting user and the correct total',
    { tag: '@smoke' },
    async ({ api, resources, workerSession }) => {
      // Own event, so price and seat count are ours to assert against. The shared
      // static events lose seats to other users mid-run.
      const event = await resources.createEvent(buildEvent({ price: 250, totalSeats: 20 }));

      const quantity = 3;
      const result = await api.bookings.create(
        buildBookingPayload({ eventId: event.id, quantity }),
      );

      // Registered before anything can throw: a failure must not leak a booking
      // the server already created.
      resources.trackBooking(result);

      expect(result.status).toBe(201);

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
    },
  );

  test('two bookings for the same event get different references', async ({ resources }) => {
    const event = await resources.createEvent(buildEvent({ price: 100, totalSeats: 10 }));

    const first = await resources.createBooking(buildBookingPayload({ eventId: event.id }));
    const second = await resources.createBooking(buildBookingPayload({ eventId: event.id }));

    expect(second.bookingRef).not.toBe(first.bookingRef);
    expect(first.bookingRef).toMatch(BOOKING_REF_PATTERN);
    expect(second.bookingRef).toMatch(BOOKING_REF_PATTERN);
  });

  test('invalid input is rejected, naming the offending field', async ({ api, resources }) => {
    const event = await resources.createEvent(buildEvent({ price: 100, totalSeats: 20 }));
    const valid = buildBookingPayload({ eventId: event.id });

    // One test over a table of cases: the same assertion shape, different inputs.
    // Soft assertions so every case reports rather than only the first failure.
    const cases: Array<{ name: string; payload: Record<string, unknown>; field: string }> = [
      { name: 'quantity below the minimum', payload: { ...valid, quantity: 0 }, field: 'quantity' },
      {
        name: 'quantity above the maximum',
        payload: { ...valid, quantity: 11 },
        field: 'quantity',
      },
      { name: 'fractional quantity', payload: { ...valid, quantity: 1.5 }, field: 'quantity' },
      {
        name: 'name shorter than 2 characters',
        payload: { ...valid, customerName: 'A' },
        field: 'customerName',
      },
      {
        name: 'phone shorter than 10 digits',
        payload: { ...valid, customerPhone: '123' },
        field: 'customerPhone',
      },
      {
        name: 'malformed email',
        payload: { ...valid, customerEmail: 'nope' },
        field: 'customerEmail',
      },
    ];

    for (const testCase of cases) {
      const result = await api.bookings.create(testCase.payload as unknown as typeof valid);
      resources.trackBooking(result);

      expect.soft(result.status, `${testCase.name} should be rejected`).toBe(400);
      expect
        .soft(validationFieldsOf(result.body), `${testCase.name} should name its field`)
        .toContain(testCase.field);
    }

    const empty = await api.bookings.create({} as unknown as typeof valid);
    expect.soft(empty.status, 'an empty body should be rejected').toBe(400);
    expect.soft(validationFieldsOf(empty.body)).toContain('eventId');
  });

  test('booking a non-existent event is rejected as not found', async ({ api }) => {
    const missingEventId = 999_999_999;

    const result = await api.bookings.create(buildBookingPayload({ eventId: missingEventId }));

    expect(result.status).toBe(404);
    expect(errorMessageOf(result.body)).toBe(`Event with id ${missingEventId} not found`);
  });

  test(
    'DOCUMENTS CURRENT BEHAVIOUR (not a requirement) — a string quantity is accepted ' +
      'and coerced, contradicting the API\'s own "must be an integer" message. ' +
      'Defect M14 / open question 14 in docs/story-review.md',
    { tag: '@characterization' },
    async ({ api, resources }) => {
      // Pinned, not endorsed: the API rejects 1.5 with "must be an integer" yet
      // accepts "3". Open question 14 in docs/story-review.md. This test exists so
      // a change in that behaviour is noticed rather than discovered by accident.
      const event = await resources.createEvent(buildEvent({ price: 100, totalSeats: 20 }));

      const result = await api.bookings.create({
        ...buildBookingPayload({ eventId: event.id }),
        quantity: '3' as unknown as number,
      });
      resources.trackBooking(result);

      expect(result.status).toBe(201);
      expect(result.data?.quantity).toBe(3);
    },
  );
});
