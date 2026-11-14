import { z } from 'zod';

/**
 * Schemas model what the API **actually returns**, verified in Phase 2 — not what
 * its documentation claims. Two observed differences matter (docs/api-findings.md):
 * `price` and `totalPrice` are strings, and several fields are undocumented.
 *
 * Every schema is `.strict()`: an unexpected key is a contract change we want to
 * be told about, which is the whole point of validating at runtime.
 */
export const PaginationMetaSchema = z
  .object({
    total: z.number().int(),
    page: z.number().int(),
    limit: z.number().int(),
    totalPages: z.number().int(),
  })
  .strict();

export const ErrorResponseSchema = z
  .object({
    success: z.literal(false),
    error: z.string(),
    details: z.array(z.object({ field: z.string(), message: z.string() }).strict()).optional(),
  })
  .strict();

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** A monetary amount the API serialises as a string, e.g. `"2500"`. */
export const MoneyStringSchema = z.string().regex(/^\d+(\.\d+)?$/, 'expected a numeric string');

/** Converts an API money string to a number for arithmetic. */
export function toAmount(value: string): number {
  return Number(value);
}
