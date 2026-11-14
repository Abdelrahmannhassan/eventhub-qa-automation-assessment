import { toAmount } from '@api/contracts/common.contract';
import { buildBookingPayload } from '@data/factories/booking.factory';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';

test.describe('AC5 — UI and API are the same flow', { tag: '@AC5' }, () => {
  test('a booking made in the UI is returned identically by the API', async ({
    api,
    resources,
    eventDetailsPage,
  }) => {
    // The reverse direction of api-to-ui-parity.spec.ts. Together they are what
    // AC5 actually asks: that both surfaces describe one booking, not two.
    const event = await resources.createEvent(buildEvent({ price: 250, totalSeats: 20 }));
    const customer = buildBookingPayload({ eventId: event.id, quantity: 3 });

    await eventDetailsPage.goto(event.id);
    await eventDetailsPage.setQuantity(3);
    await eventDetailsPage.fillCustomerDetails({
      name: customer.customerName,
      email: customer.customerEmail,
      phone: customer.customerPhone,
    });
    await eventDetailsPage.submitBooking();
    await expect(eventDetailsPage.confirmationPanel).toBeVisible();

    const reference = (await eventDetailsPage.confirmedReference.innerText()).trim();
    resources.trackBookingByRef(reference);

    const viaApi = await api.bookings.getByRef(reference);

    expect(viaApi.status).toBe(200);
    const booking = viaApi.data;
    expect(booking, 'the API must know about a booking made in the UI').toBeDefined();

    expect(booking!.quantity).toBe(3);
    expect(booking!.eventId).toBe(event.id);
    expect(booking!.customerName).toBe(customer.customerName);
    expect(toAmount(booking!.totalPrice)).toBe(toAmount(event.price) * 3);

    const inList = await api.bookings.list();
    expect(inList.data?.map((item) => item.bookingRef)).toContain(reference);
  });

  test('a booking cancelled through the API disappears from the UI', async ({
    api,
    resources,
    myBookingsPage,
  }) => {
    const event = await resources.createEvent(buildEvent({ totalSeats: 20 }));
    const booking = await resources.createBooking(
      buildBookingPayload({ eventId: event.id, quantity: 2 }),
    );

    await myBookingsPage.goto();
    await expect(myBookingsPage.cardFor(booking.bookingRef)).toBeVisible();

    const cancelled = await api.bookings.cancel(booking.id);
    expect(cancelled.status).toBe(200);

    await myBookingsPage.goto();
    await expect(myBookingsPage.cardFor(booking.bookingRef)).toBeHidden();
  });
});
