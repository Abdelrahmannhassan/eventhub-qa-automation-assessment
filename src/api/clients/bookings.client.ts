import {
  BookingByIdResponseSchema,
  BookingResponseSchema,
  BookingsListResponseSchema,
  CancelBookingResponseSchema,
} from '@api/contracts/booking.contract';
import type { Booking, CreateBookingPayload } from '@api/contracts/booking.contract';

import { BaseApiClient } from './base.client';
import type { ApiResult } from './base.client';

export class BookingsClient extends BaseApiClient {
  async create(payload: CreateBookingPayload): Promise<ApiResult<Booking>> {
    const response = await this.post('/api/bookings', payload);
    return this.toResult(response, 201, BookingResponseSchema, (parsed) => parsed.data);
  }

  /** Returns only the caller's own bookings, despite documentation to the contrary (M2). */
  async list(params: { page?: number; limit?: number } = {}): Promise<ApiResult<Booking[]>> {
    const query = new URLSearchParams();
    if (params.page !== undefined) query.set('page', String(params.page));
    if (params.limit !== undefined) query.set('limit', String(params.limit));
    const suffix = query.size > 0 ? `?${query.toString()}` : '';

    const response = await this.get(`/api/bookings${suffix}`);
    return this.toResult(response, 200, BookingsListResponseSchema, (parsed) => parsed.data);
  }

  async getById(id: number): Promise<ApiResult<Booking>> {
    const response = await this.get(`/api/bookings/${id}`);
    return this.toResult(response, 200, BookingByIdResponseSchema, (parsed) => parsed.data);
  }

  async getByRef(ref: string): Promise<ApiResult<Booking>> {
    const response = await this.get(`/api/bookings/ref/${ref}`);
    return this.toResult(response, 200, BookingByIdResponseSchema, (parsed) => parsed.data);
  }

  /** Hard delete: the record is gone afterwards and the seats are released (M11). */
  async cancel(id: number): Promise<ApiResult<{ message: string }>> {
    const response = await this.delete(`/api/bookings/${id}`);
    return this.toResult(response, 200, CancelBookingResponseSchema, (parsed) => ({
      message: parsed.message,
    }));
  }
}
