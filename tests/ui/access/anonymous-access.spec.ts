import { ANONYMOUS_STORAGE_STATE, expect, test } from '@fixtures/index';

// Opting out of authentication explicitly and visibly, which is what keeps this
// test honest rather than accidentally signed in (ADR 0004).
test.use({ storageState: ANONYMOUS_STORAGE_STATE });

test.describe('Anonymous access to the application', { tag: ['@auth', '@AC1'] }, () => {
  test('an unauthenticated visitor is redirected to the sign-in page', async ({
    page,
    loginPage,
  }) => {
    // US-114 is written for "a visitor to EventHub". A visitor cannot reach the
    // events list, let alone book — the premise of the story does not hold
    // (story-review.md W1).
    await page.goto('/events', { waitUntil: 'domcontentloaded' });

    await expect(page).toHaveURL(/\/login$/);
    await expect(loginPage.emailInput).toBeVisible();
    await expect(loginPage.submitButton).toBeVisible();
  });
});
