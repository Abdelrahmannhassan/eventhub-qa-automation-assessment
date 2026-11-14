import type { Locator } from '@playwright/test';

import { BasePage } from './base.page';

export class MyBookingsPage extends BasePage {
  readonly heading = this.page.getByRole('heading', { name: 'My Bookings' });
  readonly emptyState = this.page.getByText('No bookings yet');
  readonly cards = this.page.getByTestId('booking-card');

  async goto(): Promise<void> {
    await this.open('/bookings');
  }

  /**
   * Presence-based lookup by reference — never "the card at index 0". Pooled
   * accounts may legitimately hold bookings from another run, so a test must
   * find *its own* booking rather than assume it is alone (ADR 0008).
   */
  cardFor(bookingRef: string): Locator {
    return this.cards.filter({ hasText: bookingRef });
  }

  cancelButtonFor(bookingRef: string): Locator {
    return this.cardFor(bookingRef).getByTestId('cancel-booking-btn');
  }

  /** In-page confirmation dialog; no DELETE is sent until it is accepted. */
  readonly confirmCancelButton = this.page.getByTestId('confirm-dialog-yes');

  async cancelBooking(bookingRef: string): Promise<void> {
    await this.cancelButtonFor(bookingRef).click();
    await this.confirmCancelButton.click();
  }
}
