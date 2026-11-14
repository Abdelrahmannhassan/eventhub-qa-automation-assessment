import { buildBookingPayload } from '@data/factories/booking.factory';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';
import { asDisplayedAmount } from '@support/assertions/money';

test.describe('AC3 and AC4 — My Bookings in the UI', { tag: ['@AC3', '@AC4'] }, () => {
  test(
    'a booking made in the UI then appears in My Bookings',
    { tag: '@smoke' },
    async ({ resources, eventDetailsPage, myBookingsPage }) => {
      const event = await resources.createEvent(buildEvent({ price: 300, totalSeats: 20 }));
      const customer = buildBookingPayload({ eventId: event.id, quantity: 2 });

      await eventDetailsPage.goto(event.id);
      await eventDetailsPage.setQuantity(2);
      await eventDetailsPage.fillCustomerDetails({
        name: customer.customerName,
        email: customer.customerEmail,
        phone: customer.customerPhone,
      });
      await eventDetailsPage.submitBooking();
      await expect(eventDetailsPage.confirmationPanel).toBeVisible();

      const reference = (await eventDetailsPage.confirmedReference.innerText()).trim();
      resources.trackBookingByRef(reference);

      await myBookingsPage.goto();

      const card = myBookingsPage.cardFor(reference);
      await expect(card).toBeVisible();
      await expect(card).toContainText(event.title);
      await expect(card).toContainText('2 tickets');
      await expect(card).toContainText(asDisplayedAmount(600));
      await expect(card).toContainText('confirmed');
    },
  );

  test('cancelling from the UI removes the card and releases the seats', async ({
    api,
    resources,
    myBookingsPage,
  }) => {
    const event = await resources.createEvent(buildEvent({ totalSeats: 20 }));
    const quantity = 3;
    const booking = await resources.createBooking(
      buildBookingPayload({ eventId: event.id, quantity }),
    );

    await myBookingsPage.goto();
    await expect(myBookingsPage.cardFor(booking.bookingRef)).toBeVisible();

    await myBookingsPage.cancelBooking(booking.bookingRef);

    await expect(myBookingsPage.cardFor(booking.bookingRef)).toBeHidden();

    // Verified through the API, because the event page does not refresh its own
    // availability after a change (mismatch U2).
    const restored = await api.events.getById(event.id);
    expect(restored.data?.availableSeats).toBe(event.availableSeats);
  });

  test('dismissing the cancellation dialog leaves the booking untouched', async ({
    api,
    resources,
    myBookingsPage,
  }) => {
    const event = await resources.createEvent(buildEvent({ totalSeats: 20 }));
    const quantity = 2;
    const booking = await resources.createBooking(
      buildBookingPayload({ eventId: event.id, quantity }),
    );

    await myBookingsPage.goto();
    await myBookingsPage.cancelButtonFor(booking.bookingRef).click();
    await expect(myBookingsPage.confirmCancelButton).toBeVisible();

    await myBookingsPage.dismissCancelDialogButton.click();

    await expect(myBookingsPage.confirmCancelButton).toBeHidden();
    await expect(myBookingsPage.cardFor(booking.bookingRef)).toBeVisible();

    const unchanged = await api.events.getById(event.id);
    expect(unchanged.data?.availableSeats).toBe(event.availableSeats - quantity);
  });
});
