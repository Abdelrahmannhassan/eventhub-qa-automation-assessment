import { errorMessageOf } from '@api/contracts/common.contract';
import { buildBookingPayload } from '@data/factories/booking.factory';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';

test.describe('AC4 — cancel a booking', { tag: '@AC4' }, () => {
  test(
    'cancelling releases exactly the booked seats',
    { tag: '@smoke' },
    async ({ api, resources }) => {
      const event = await resources.createEvent(buildEvent({ totalSeats: 20 }));
      const quantity = 3;
      const booking = await resources.createBooking(
        buildBookingPayload({ eventId: event.id, quantity }),
      );

      const booked = await api.events.getById(event.id);
      expect(booked.data?.availableSeats).toBe(event.availableSeats - quantity);

      const cancelled = await api.bookings.cancel(booking.id);

      expect(cancelled.status).toBe(200);
      expect(cancelled.data?.message).toBe('Booking cancelled');

      const restored = await api.events.getById(event.id);
      expect(restored.data?.availableSeats).toBe(event.availableSeats);
    },
  );

  test('another account cannot cancel the booking, and it survives the attempt', async ({
    api,
    foreignApi,
    resources,
  }) => {
    // The most important negative test in the suite: the one that would catch a
    // real authorization regression.
    const event = await resources.createEvent(buildEvent());
    const booking = await resources.createBooking(buildBookingPayload({ eventId: event.id }));

    const attempt = await foreignApi.bookings.cancel(booking.id);

    // Note the inconsistency: a non-owner READ returns 403, a non-owner DELETE
    // returns 404 (mismatch M10). The protection is real; the status code is not
    // consistent. We assert the behaviour that matters.
    expect(attempt.status).not.toBe(200);
    expect(attempt.status).toBe(404);

    const stillThere = await api.bookings.getByRef(booking.bookingRef);
    expect(stillThere.status, 'the booking must survive a foreign cancel attempt').toBe(200);
    expect(stillThere.data?.id).toBe(booking.id);
  });

  test(
    'a cancelled booking is deleted rather than retained as cancelled',
    { tag: '@characterization' },
    async ({ api, resources }) => {
      // Pinned, not endorsed. The API schema advertises status "confirmed |
      // cancelled", but cancelling hard-deletes the record, so "cancelled" is
      // unreachable. Whether a cancellation record should survive is open
      // question 4 in docs/story-review.md.
      const event = await resources.createEvent(buildEvent());
      const booking = await resources.createBooking(buildBookingPayload({ eventId: event.id }));

      await api.bookings.cancel(booking.id);

      const byRef = await api.bookings.getByRef(booking.bookingRef);
      expect(byRef.status).toBe(404);
      expect(errorMessageOf(byRef.body)).toBe(
        `Booking with reference "${booking.bookingRef}" not found`,
      );

      const list = await api.bookings.list();
      expect(list.data?.map((item) => item.bookingRef)).not.toContain(booking.bookingRef);
    },
  );

  test(
    'cancelling the same booking twice is not idempotent',
    { tag: '@characterization' },
    async ({ api, resources }) => {
      // Pinned, not endorsed: the second call reports 404 rather than succeeding
      // quietly. Also open question 4.
      const event = await resources.createEvent(buildEvent());
      const booking = await resources.createBooking(buildBookingPayload({ eventId: event.id }));

      const first = await api.bookings.cancel(booking.id);
      expect(first.status).toBe(200);

      const second = await api.bookings.cancel(booking.id);
      expect(second.status).toBe(404);
      expect(errorMessageOf(second.body)).toBe(`Booking with id ${booking.id} not found`);
    },
  );
});
