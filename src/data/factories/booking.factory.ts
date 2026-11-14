import type { CreateBookingPayload } from '@api/contracts/booking.contract';

import { uniqueSuffix } from './unique';

/**
 * A valid-by-default booking payload.
 *
 * The email domain is deliberately **not** Gmail. The API silently rewrites
 * Gmail addresses — stripping dots and `+suffix` — so a test using one would
 * have to assert a value different from the one it sent (mismatch M12). Keeping
 * that trap inside the factory means no individual test can fall into it.
 */
export function buildBookingPayload(
  overrides: Partial<CreateBookingPayload> & Pick<CreateBookingPayload, 'eventId'>,
): CreateBookingPayload {
  const suffix = uniqueSuffix();

  return {
    customerName: `QA Customer ${suffix}`,
    customerEmail: `qa.customer.${suffix.toLowerCase()}@example.com`,
    customerPhone: '+201000000000',
    quantity: 1,
    ...overrides,
  };
}
