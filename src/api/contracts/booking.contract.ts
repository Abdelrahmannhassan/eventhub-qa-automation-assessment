import { z } from 'zod';

import { MoneyStringSchema, PaginationMetaSchema } from './common.contract';
import { EventSchema } from './event.contract';

/**
 * Observed booking-reference format: `H-Z91U0V`, `Q-ZXPAL4` — one uppercase
 * letter (the event title's initial), a hyphen, then six uppercase alphanumerics.
 * The API documentation claims `EVT-XXXXXX`, which the application never produces
 * (mismatch M6). We assert reality and report the documentation as the defect.
 */
export const BOOKING_REF_PATTERN = /^[A-Z]-[A-Z0-9]{6}$/;

export const BookingSchema = z
  .object({
    id: z.number().int(),
    eventId: z.number().int(),
    // Undocumented (M7), but it is what proves the booking belongs to the caller.
    userId: z.number().int(),
    customerName: z.string(),
    // NOTE: the server rewrites this — Gmail dots and `+suffix` are stripped and
    // everything is lowercased (M12). Factories use non-Gmail domains so tests
    // are not entangled with that behaviour.
    customerEmail: z.string(),
    customerPhone: z.string(),
    quantity: z.number().int(),
    // Documented as number/float, actually a string (M4).
    totalPrice: MoneyStringSchema,
    status: z.enum(['confirmed', 'cancelled']),
    bookingRef: z.string().regex(BOOKING_REF_PATTERN),
    createdAt: z.string(),
    updatedAt: z.string(),
    event: EventSchema,
  })
  .strict();

export type Booking = z.infer<typeof BookingSchema>;

export const BookingResponseSchema = z
  .object({
    success: z.literal(true),
    data: BookingSchema,
    message: z.string(),
  })
  .strict();

export const BookingByIdResponseSchema = z
  .object({ success: z.literal(true), data: BookingSchema })
  .strict();

export const BookingsListResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.array(BookingSchema),
    pagination: PaginationMetaSchema,
  })
  .strict();

export const CancelBookingResponseSchema = z
  .object({ success: z.literal(true), message: z.string() })
  .strict();

export interface CreateBookingPayload {
  eventId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  quantity: number;
}
