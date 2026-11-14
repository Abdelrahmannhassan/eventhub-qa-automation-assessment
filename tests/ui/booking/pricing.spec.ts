import { toAmount } from '@api/contracts/common.contract';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';
import { asDisplayedAmount } from '@support/assertions/money';

test.describe('AC2 — the price breakdown in the UI', { tag: '@AC2' }, () => {
  test('the total updates to price x quantity as the quantity changes', async ({
    resources,
    eventDetailsPage,
  }) => {
    const event = await resources.createEvent(buildEvent({ price: 250, totalSeats: 50 }));
    const unitPrice = toAmount(event.price);

    await eventDetailsPage.goto(event.id);

    for (const quantity of [1, 2, 3, 10]) {
      await eventDetailsPage.setQuantity(quantity);

      await expect(eventDetailsPage.ticketCount).toHaveText(String(quantity));
      await expect(
        eventDetailsPage.totalAmount,
        `total shown for ${quantity} ticket(s)`,
      ).toContainText(asDisplayedAmount(unitPrice * quantity));
      await expect(eventDetailsPage.lineItem).toContainText(
        `${asDisplayedAmount(unitPrice)} × ${quantity} ticket`,
      );
    }
  });

  test('the quantity stepper is bounded at 1 and 10', async ({ resources, eventDetailsPage }) => {
    // The 1-10 cap is enforced but appears nowhere in US-114 (gap G6).
    const event = await resources.createEvent(buildEvent({ price: 100, totalSeats: 50 }));

    await eventDetailsPage.goto(event.id);

    await expect(eventDetailsPage.ticketCount).toHaveText('1');
    await expect(
      eventDetailsPage.decreaseQuantityButton,
      'decrement must be disabled at the floor',
    ).toBeDisabled();

    const maximum = await eventDetailsPage.increaseToMaximum();

    expect(maximum, 'the stepper should cap at 10').toBe(10);
    await expect(
      eventDetailsPage.increaseQuantityButton,
      'increment must be disabled at the ceiling',
    ).toBeDisabled();
    await expect(eventDetailsPage.totalAmount).toContainText(asDisplayedAmount(1000));
  });
});
