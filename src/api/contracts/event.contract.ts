import { z } from 'zod';

import { MoneyStringSchema, PaginationMetaSchema } from './common.contract';

/** Shape verified against both a shared static event and a user-created one. */
export const EventSchema = z
  .object({
    id: z.number().int(),
    title: z.string(),
    description: z.string(),
    category: z.string(),
    venue: z.string(),
    city: z.string(),
    eventDate: z.string(),
    // Documented as number/float, actually a string (mismatch M5).
    price: MoneyStringSchema,
    totalSeats: z.number().int(),
    availableSeats: z.number().int(),
    // `null` on user-created events; undocumented, like isStatic and userId (M7).
    imageUrl: z.string().nullable(),
    isStatic: z.boolean(),
    userId: z.number().int().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export type Event = z.infer<typeof EventSchema>;

/** `GET /events/{id}` — envelope carries no `message`. */
export const EventResponseSchema = z
  .object({ success: z.literal(true), data: EventSchema })
  .strict();

/** `POST /events` — the create envelope additionally carries `message`. */
export const EventCreatedResponseSchema = z
  .object({ success: z.literal(true), data: EventSchema, message: z.string() })
  .strict();

export const EventsListResponseSchema = z
  .object({
    success: z.literal(true),
    data: z.array(EventSchema),
    pagination: PaginationMetaSchema,
  })
  .strict();

/** Required fields confirmed by probing `POST /events` with only a title. */
export interface CreateEventPayload {
  title: string;
  description?: string;
  category: string;
  venue: string;
  city: string;
  eventDate: string;
  price: number;
  totalSeats: number;
}
