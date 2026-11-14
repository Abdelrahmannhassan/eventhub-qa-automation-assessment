import {
  EventCreatedResponseSchema,
  EventResponseSchema,
  EventsListResponseSchema,
} from '@api/contracts/event.contract';
import type { CreateEventPayload, Event } from '@api/contracts/event.contract';

import { BaseApiClient } from './base.client';
import type { ApiResult } from './base.client';

export class EventsClient extends BaseApiClient {
  async list(params: { page?: number; limit?: number } = {}): Promise<ApiResult<Event[]>> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : '';

    const response = await this.get(`/api/events${suffix}`);
    return this.toResult(response, 200, EventsListResponseSchema, (parsed) => parsed.data);
  }

  async getById(id: number): Promise<ApiResult<Event>> {
    const response = await this.get(`/api/events/${id}`);
    return this.toResult(response, 200, EventResponseSchema, (parsed) => parsed.data);
  }

  /**
   * Creates an event **private to the acting account** (another account gets a
   * `404`). This is how price- and seat-dependent tests become deterministic
   * instead of depending on shared inventory other candidates are consuming.
   */
  async create(payload: CreateEventPayload): Promise<ApiResult<Event>> {
    const response = await this.post('/api/events', payload);
    return this.toResult(response, 201, EventCreatedResponseSchema, (parsed) => parsed.data);
  }

  async remove(id: number): Promise<number> {
    const response = await this.delete(`/api/events/${id}`);
    return response.status();
  }
}
