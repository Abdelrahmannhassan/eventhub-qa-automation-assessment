import type { Page } from '@playwright/test';

import { config } from '@config/env';
import { logger } from '@core/logger';

/**
 * Page Objects own locators and intent-level actions. They expose state through
 * locators or plain readers and contain **no assertions** — a page object that
 * asserts cannot serve a test with a different expectation, and its failure
 * message describes the page object instead of the requirement (CLAUDE.md §2).
 */
export abstract class BasePage {
  protected readonly log = logger.child(this.constructor.name);

  constructor(protected readonly page: Page) {}

  protected async open(pathname: string): Promise<void> {
    this.log.debug('Navigating', { pathname });
    await this.page.goto(`${config.baseUrl}${pathname}`, { waitUntil: 'domcontentloaded' });
  }

  /** Shared header controls, present on every authenticated page. */
  get signedInEmail() {
    return this.page.getByTestId('user-email-display');
  }

  get logoutButton() {
    return this.page.getByTestId('logout-btn');
  }

  get myBookingsNavLink() {
    return this.page.getByTestId('nav-bookings');
  }

  get eventsNavLink() {
    return this.page.getByTestId('nav-events');
  }
}
