import type { Locator, Page } from '@playwright/test';

import { config } from '@config/env';
import { logger } from '@core/logger';

/**
 * Page Objects own locators and intent-level actions. They expose state through
 * locators or plain readers and contain **no assertions** — a page object that
 * asserts cannot serve a test with a different expectation, and its failure
 * message describes the page object instead of the requirement (CLAUDE.md §2).
 */
export abstract class BasePage {
  /**
   * Ceiling for "the page is ready to interact with" waits.
   *
   * These are **navigation-class**, not action-class: becoming ready means the
   * host served the page, Next.js hydrated it, and the client-side fetch for the
   * page's data completed. The tighter `actionTimeout` (15s) is right for a
   * click, and too tight for that whole chain on a shared host — a readiness
   * wait that used it failed intermittently in Phase 7.
   */
  protected static readonly PAGE_READY_TIMEOUT_MS = 30_000;

  protected readonly log = logger.child(this.constructor.name);

  constructor(protected readonly page: Page) {}

  protected async open(pathname: string): Promise<void> {
    this.log.debug('Navigating', { pathname });
    await this.page.goto(`${config.baseUrl}${pathname}`, { waitUntil: 'domcontentloaded' });
  }

  /**
   * Wait for the element that proves this page is ready for interaction. Page
   * objects call this from `goto`, so a test always starts from a settled page
   * rather than racing hydration with its first assertion.
   */
  protected async waitUntilReady(locator: Locator): Promise<void> {
    await locator.waitFor({ timeout: BasePage.PAGE_READY_TIMEOUT_MS });
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
