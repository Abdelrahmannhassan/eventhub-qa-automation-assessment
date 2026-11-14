import type { APIRequestContext } from '@playwright/test';

import { AuthClient } from './auth.client';
import { BookingsClient } from './bookings.client';
import { EventsClient } from './events.client';

export { BaseApiClient, ApiResult, ContractViolationError } from './base.client';
export { AuthClient } from './auth.client';
export { BookingsClient } from './bookings.client';
export { EventsClient } from './events.client';

/** Every API client bound to one request context (and therefore one identity). */
export interface ApiClients {
  auth: AuthClient;
  events: EventsClient;
  bookings: BookingsClient;
}

export function createApiClients(request: APIRequestContext): ApiClients {
  return {
    auth: new AuthClient(request),
    events: new EventsClient(request),
    bookings: new BookingsClient(request),
  };
}
