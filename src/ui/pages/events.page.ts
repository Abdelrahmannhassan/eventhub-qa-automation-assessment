import type { Locator } from '@playwright/test';

import { BasePage } from './base.page';

export class EventsPage extends BasePage {
  readonly heading = this.page.getByRole('heading', { name: 'Upcoming Events' });
  readonly searchInput = this.page.getByPlaceholder('Search events, venues…');

  /**
   * Scoped by test id rather than `#event-card`: the application renders the
   * same `id` on every card, which is invalid HTML and makes id selectors
   * ambiguous (mismatch U6).
   */
  readonly cards = this.page.getByTestId('event-card');

  async goto(): Promise<void> {
    await this.open('/events');
    await this.waitUntilReady(this.heading);
  }

  cardFor(title: string): Locator {
    return this.cards.filter({ hasText: title });
  }

  async openEvent(id: number): Promise<void> {
    await this.open(`/events/${id}`);
  }
}
