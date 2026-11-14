import { errorMessageOf } from '@api/contracts/common.contract';
import { buildBookingPayload } from '@data/factories/booking.factory';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';

test.describe('AC3 — the booking appears in My Bookings', { tag: '@AC3' }, () => {
  test(
    'the list contains the booking just created',
    { tag: '@smoke' },
    async ({ api, resources }) => {
      const event = await resources.createEvent(buildEvent());
      const booking = await resources.createBooking(
        buildBookingPayload({ eventId: event.id, quantity: 2 }),
      );

      const list = await api.bookings.list();

      expect(list.status).toBe(200);
      // Presence-based, never a count: a pooled account may legitimately hold
      // bookings from another run (ADR 0008).
      expect(list.data?.map((item) => item.bookingRef)).toContain(booking.bookingRef);
    },
  );

  test('the owner can read the booking by its reference', async ({ api, resources }) => {
    const event = await resources.createEvent(buildEvent({ price: 150 }));
    const booking = await resources.createBooking(
      buildBookingPayload({ eventId: event.id, quantity: 2 }),
    );

    const found = await api.bookings.getByRef(booking.bookingRef);

    expect(found.status).toBe(200);
    expect(found.data?.id).toBe(booking.id);
    expect(found.data?.totalPrice).toBe(booking.totalPrice);
  });

  test("another account's booking list does not contain it", async ({ foreignApi, resources }) => {
    const event = await resources.createEvent(buildEvent());
    const booking = await resources.createBooking(buildBookingPayload({ eventId: event.id }));

    const foreignList = await foreignApi.bookings.list();

    expect(foreignList.status).toBe(200);
    expect(foreignList.data?.map((item) => item.bookingRef)).not.toContain(booking.bookingRef);
  });

  test('another account cannot read the booking by id or by reference', async ({
    foreignApi,
    resources,
  }) => {
    const event = await resources.createEvent(buildEvent());
    const booking = await resources.createBooking(buildBookingPayload({ eventId: event.id }));

    const byId = await foreignApi.bookings.getById(booking.id);
    expect(byId.status, 'reading another account booking by id').toBe(403);
    expect(errorMessageOf(byId.body)).toBe('You are not authorized to view this booking');

    const byRef = await foreignApi.bookings.getByRef(booking.bookingRef);
    expect(byRef.status, 'reading another account booking by reference').toBe(403);
    expect(errorMessageOf(byRef.body)).toBe('You do not own this booking');
  });
});
