import { z } from 'zod';

/**
 * Schemas model what the API **actually returns**, verified in Phase 2 — not what
 * its documentation claims. Two observed differences matter
 * (docs/api-findings.md): `price` and `totalPrice` are strings, and several
 * fields are undocumented.
 *
 * Every contract exists in **two modes** (ADR 0009):
 *
 * - **lenient** (`z.object`, the default) — unknown keys are stripped. Used by the
 *   clients that flow tests depend on, so a field added by a third party we do
 *   not control cannot fail 30 behavioural tests at once.
 * - **strict** (`z.strictObject`) — an unknown key is an error. Used only by the
 *   dedicated contract tests in `tests/api/contracts/`, whose entire job is to
 *   notice that the API changed shape.
 */
const paginationMetaShape = {
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int(),
};

export const PaginationMetaSchema = z.object(paginationMetaShape);
export const StrictPaginationMetaSchema = z.strictObject(paginationMetaShape);

const errorDetailShape = { field: z.string(), message: z.string() };

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  details: z.array(z.object(errorDetailShape)).optional(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/** A monetary amount the API serialises as a string, e.g. `"2500"`. */
export const MoneyStringSchema = z.string().regex(/^\d+(\.\d+)?$/, 'expected a numeric string');

/** Converts an API money string to a number for arithmetic. */
export function toAmount(value: string): number {
  return Number(value);
}

/** Reads `error` out of an error body without trusting its shape. */
export function errorMessageOf(body: unknown): string | undefined {
  const parsed = ErrorResponseSchema.safeParse(body);
  return parsed.success ? parsed.data.error : undefined;
}

/** Reads `details` out of a validation-error body without trusting its shape. */
export function validationFieldsOf(body: unknown): string[] {
  const parsed = ErrorResponseSchema.safeParse(body);
  return parsed.success ? (parsed.data.details ?? []).map((detail) => detail.field) : [];
}
