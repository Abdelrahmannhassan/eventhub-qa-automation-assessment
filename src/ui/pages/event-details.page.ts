import { BasePage } from './base.page';

/**
 * Event detail page, which also hosts the booking form and — after a successful
 * submission — renders the confirmation inline rather than navigating to a
 * separate route (observed in Phase 2).
 */
export class EventDetailsPage extends BasePage {
  readonly title = this.page.getByRole('heading', { level: 1 });
  readonly bookingFormHeading = this.page.getByRole('heading', { name: 'Book Tickets' });

  // Quantity is a stepper, not a numeric input. The decrement label is U+2212
  // MINUS SIGN, not a hyphen.
  readonly ticketCount = this.page.locator('#ticket-count');
  readonly increaseQuantityButton = this.page.getByRole('button', { name: '+' });
  readonly decreaseQuantityButton = this.page.getByRole('button', { name: '−' });

  readonly nameInput = this.page.locator('#customerName');
  readonly emailInput = this.page.getByTestId('customer-email');
  // The input is named `phone` even though the API field is `customerPhone`.
  readonly phoneInput = this.page.locator('#phone');
  readonly confirmBookingButton = this.page.locator('#confirm-booking');

  readonly confirmationPanel = this.page.getByText('Booking Confirmed!');
  readonly availabilityText = this.page.getByText(/\d+ \/ \d+ seats/);

  async goto(eventId: number): Promise<void> {
    await this.open(`/events/${eventId}`);
    await this.waitUntilReady(this.bookingFormHeading);
  }

  /** Clicks `+` until the stepper shows `quantity`. Never exceeds the UI's cap. */
  async setQuantity(quantity: number): Promise<void> {
    for (let current = Number(await this.ticketCount.innerText()); current < quantity; current++) {
      await this.increaseQuantityButton.click();
    }
  }

  async fillCustomerDetails(details: {
    name: string;
    email: string;
    phone: string;
  }): Promise<void> {
    await this.nameInput.fill(details.name);
    await this.emailInput.fill(details.email);
    await this.phoneInput.fill(details.phone);
  }

  async submitBooking(): Promise<void> {
    await this.confirmBookingButton.click();
  }

  /** The confirmation's booking reference, read from the panel's own row. */
  get confirmedReference() {
    return this.page.getByText(/^[A-Z]-[A-Z0-9]{6}$/);
  }

  /** `Total` row inside the price breakdown. */
  get totalAmount() {
    return this.page
      .locator('span')
      .filter({ hasText: /^Total$/ })
      .locator('..');
  }

  get lineItem() {
    return this.page.getByText(/^\$[\d,]+ × \d+ tickets?$/);
  }

  /** Validation feedback rendered by the app itself (the form is `novalidate`). */
  get validationMessages() {
    return this.page.locator('form').getByText(/must be|required|at least|valid/i);
  }

  /** Reads the quantity the stepper currently shows. */
  async currentQuantity(): Promise<number> {
    return Number(await this.ticketCount.innerText());
  }

  /** Clicks `−` until the stepper shows `quantity`, never below the UI's floor. */
  async decreaseQuantityTo(quantity: number): Promise<void> {
    for (let current = await this.currentQuantity(); current > quantity; current--) {
      await this.decreaseQuantityButton.click();
    }
  }

  /** Clicks `+` until it becomes disabled, returning the quantity reached. */
  async increaseToMaximum(): Promise<number> {
    while (await this.increaseQuantityButton.isEnabled()) {
      await this.increaseQuantityButton.click();
    }

    return this.currentQuantity();
  }
}
