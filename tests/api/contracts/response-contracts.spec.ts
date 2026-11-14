import type { z } from 'zod';

import {
  StrictBookingByIdResponseSchema,
  StrictBookingResponseSchema,
  StrictBookingsListResponseSchema,
  StrictCancelBookingResponseSchema,
} from '@api/contracts/booking.contract';
import {
  StrictAuthSuccessSchema,
  StrictConfigSuccessSchema,
  StrictHealthSuccessSchema,
  StrictMeSuccessSchema,
} from '@api/contracts/auth.contract';
import {
  StrictEventCreatedResponseSchema,
  StrictEventResponseSchema,
  StrictEventsListResponseSchema,
} from '@api/contracts/event.contract';
import { accountCredentials } from '@auth/accounts';
import { buildBookingPayload } from '@data/factories/booking.factory';
import { buildEvent } from '@data/factories/event.factory';
import { expect, test } from '@fixtures/index';

/**
 * The **only** place strict schemas are used (ADR 0009).
 *
 * Flow tests validate leniently, so a field added by a third party we do not
 * control cannot fail thirty behavioural tests at once. These tests exist
 * precisely to notice that change: when the API alters its shape, exactly one
 * test here goes red and names the field.
 *
 * They assert against `result.body` — the raw, unparsed response — rather than
 * the client's typed output.
 */
function expectExactShape(schema: z.ZodType, body: unknown, label: string): void {
  const parsed = schema.safeParse(body);
  const issues = parsed.success
    ? []
    : parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);

  expect(
    issues,
    `${label} no longer matches its recorded contract. An added field is usually a ` +
      `benign API change — update the shape in src/api/contracts/ and note it in ` +
      `docs/api-findings.md. A removed or retyped field is a breaking change.`,
  ).toEqual([]);
}

test.describe('API response contracts', { tag: '@contract' }, () => {
  test('booking endpoints return exactly their recorded shape', async ({ api, resources }) => {
    const event = await resources.createEvent(buildEvent({ price: 100, totalSeats: 10 }));

    const created = await api.bookings.create(buildBookingPayload({ eventId: event.id }));
    resources.trackBooking(created);
    expectExactShape(StrictBookingResponseSchema, created.body, 'POST /api/bookings');

    const booking = created.data!;

    const byId = await api.bookings.getById(booking.id);
    expectExactShape(StrictBookingByIdResponseSchema, byId.body, 'GET /api/bookings/{id}');

    const byRef = await api.bookings.getByRef(booking.bookingRef);
    expectExactShape(StrictBookingByIdResponseSchema, byRef.body, 'GET /api/bookings/ref/{ref}');

    const list = await api.bookings.list();
    expectExactShape(StrictBookingsListResponseSchema, list.body, 'GET /api/bookings');

    const cancelled = await api.bookings.cancel(booking.id);
    expectExactShape(
      StrictCancelBookingResponseSchema,
      cancelled.body,
      'DELETE /api/bookings/{id}',
    );
  });

  test('event endpoints return exactly their recorded shape', async ({ api, resources }) => {
    const created = await api.events.create(buildEvent());
    resources.trackEvent(created);
    expectExactShape(StrictEventCreatedResponseSchema, created.body, 'POST /api/events');

    const event = created.data!;

    const byId = await api.events.getById(event.id);
    expectExactShape(StrictEventResponseSchema, byId.body, 'GET /api/events/{id}');

    // Covers the three shared static events too, not just our own, so a shape
    // difference between static and user-created events would surface here.
    const list = await api.events.list({ page: 1, limit: 20 });
    expectExactShape(StrictEventsListResponseSchema, list.body, 'GET /api/events');
  });

  test('auth and public endpoints return exactly their recorded shape', async ({
    api,
    anonymousApi,
  }) => {
    const login = await anonymousApi.auth.login(accountCredentials('a'));
    expectExactShape(StrictAuthSuccessSchema, login.body, 'POST /api/auth/login');

    const identity = await api.auth.me();
    expectExactShape(StrictMeSuccessSchema, identity.body, 'GET /api/auth/me');

    const health = await anonymousApi.auth.health();
    expectExactShape(StrictHealthSuccessSchema, health.body, 'GET /api/health');

    const config = await anonymousApi.auth.config();
    expectExactShape(StrictConfigSuccessSchema, config.body, 'GET /api/config');
  });
});
