import { buildBookingPayload } from '@data/factories/booking.factory';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';

test.describe('AC1 — book tickets through the UI', { tag: ['@AC1', '@smoke'] }, () => {
  test('confirming the form shows a confirmation with a booking reference', async ({
    resources,
    eventDetailsPage,
  }) => {
    // Arrange through the API, act through the UI: the browser is used only for
    // what only a browser can prove (docs/test-strategy.md).
    const event = await resources.createEvent(buildEvent({ price: 250, totalSeats: 20 }));
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
    await expect(eventDetailsPage.confirmedReference).toBeVisible();

    const reference = (await eventDetailsPage.confirmedReference.innerText()).trim();
    resources.trackBookingByRef(reference);

    expect(reference).toMatch(/^[A-Z]-[A-Z0-9]{6}$/);

    // AC2's arithmetic, as the user actually sees it: 250 x 2.
    await expect(eventDetailsPage.totalAmount).toContainText('$500');
  });
});
