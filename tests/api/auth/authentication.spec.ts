import { errorMessageOf } from '@api/contracts/common.contract';
import { buildBookingPayload } from '@data/factories/booking.factory';
import { expect, test } from '@fixtures/index';

test.describe('Authentication contract', { tag: '@auth' }, () => {
  test(
    'creating a booking without a token is rejected',
    { tag: ['@AC5', '@smoke'] },
    async ({ anonymousApi }) => {
      // This test documents the contradiction at the heart of US-114: the story
      // says "As a visitor to EventHub I want to book tickets", and an
      // unauthenticated caller cannot book at all (story-review.md W1).
      const result = await anonymousApi.bookings.create(buildBookingPayload({ eventId: 1 }));

      expect(result.status).toBe(401);
      expect(errorMessageOf(result.body)).toBe('Unauthorized');
    },
  );

  test('reading events or bookings without a token is rejected', async ({ anonymousApi }) => {
    // The published OpenAPI document declares no security on either endpoint
    // (mismatch M1); reality requires it.
    const events = await anonymousApi.events.list();
    expect.soft(events.status, 'GET /events without a token').toBe(401);
    expect.soft(errorMessageOf(events.body)).toBe('Unauthorized');

    const bookings = await anonymousApi.bookings.list();
    expect.soft(bookings.status, 'GET /bookings without a token').toBe(401);
    expect.soft(errorMessageOf(bookings.body)).toBe('Unauthorized');

    const identity = await anonymousApi.auth.me();
    expect.soft(identity.status, 'GET /auth/me without a token').toBe(401);
  });

  test('the two public endpoints need no token', async ({ anonymousApi, api }) => {
    // /health and /config are the only unauthenticated endpoints, which is what
    // makes a fast unauthenticated smoke check possible at all.
    const authenticated = await api.auth.me();
    expect(authenticated.status, 'a valid token still resolves an identity').toBe(200);

    const health = await anonymousApi.auth.health();
    expect(health.status, 'GET /health without a token').toBe(200);

    const config = await anonymousApi.auth.config();
    expect(config.status, 'GET /config without a token').toBe(200);
  });
});
