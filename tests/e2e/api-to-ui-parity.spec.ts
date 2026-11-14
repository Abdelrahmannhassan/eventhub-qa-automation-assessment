import { buildBookingPayload } from '@data/factories/booking.factory';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';

test.describe('AC5 — API and UI are the same flow', { tag: ['@AC5', '@smoke'] }, () => {
  test('a booking created through the API appears in My Bookings in the UI', async ({
    resources,
    myBookingsPage,
  }) => {
    const event = await resources.createEvent(buildEvent({ price: 100, totalSeats: 10 }));
    const booking = await resources.createBooking(
      buildBookingPayload({ eventId: event.id, quantity: 2 }),
    );

    await myBookingsPage.goto();

    // Presence-based: find *our* booking by reference rather than assuming the
    // account holds exactly one (ADR 0008).
    const card = myBookingsPage.cardFor(booking.bookingRef);
    await expect(card).toBeVisible();
    await expect(card).toContainText('2 tickets');
    await expect(card).toContainText('$200');
  });
});
