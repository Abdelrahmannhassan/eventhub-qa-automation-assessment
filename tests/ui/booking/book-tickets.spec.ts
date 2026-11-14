import { buildBookingPayload } from '@data/factories/booking.factory';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';
import { asDisplayedAmount } from '@support/assertions/money';

test.describe('AC1 — book tickets through the UI', { tag: '@AC1' }, () => {
  test(
    'confirming the form shows a confirmation with a booking reference',
    { tag: '@smoke' },
    async ({ resources, eventDetailsPage }) => {
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
      await expect(eventDetailsPage.totalAmount).toContainText(asDisplayedAmount(500));
    },
  );

  test('an invalid phone number is rejected before anything is submitted', async ({
    page,
    resources,
    eventDetailsPage,
  }) => {
    const event = await resources.createEvent(buildEvent({ price: 100, totalSeats: 10 }));
    const customer = buildBookingPayload({ eventId: event.id });

    // One representative validation case in the UI. The full boundary matrix
    // lives at the API layer, where it is far cheaper (docs/test-strategy.md).
    const bookingRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/api/bookings')) {
        bookingRequests.push(request.url());
      }
    });

    await eventDetailsPage.goto(event.id);
    await eventDetailsPage.fillCustomerDetails({
      name: customer.customerName,
      email: customer.customerEmail,
      phone: '123',
    });
    await eventDetailsPage.submitBooking();

    await expect(eventDetailsPage.validationMessages).toContainText('Enter a valid 10-digit phone');
    await expect(eventDetailsPage.confirmationPanel).toBeHidden();

    // The UI blocks client-side rather than letting the API reject it, so no
    // request should have been sent at all.
    expect(bookingRequests, 'no booking request should be issued').toHaveLength(0);
  });
});
