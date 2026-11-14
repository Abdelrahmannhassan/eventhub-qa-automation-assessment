import { z } from 'zod';

export const AuthSuccessSchema = z
  .object({
    success: z.literal(true),
    token: z.string().min(1),
    user: z.object({ id: z.number().int(), email: z.string() }).strict(),
  })
  .strict();

export type AuthSuccess = z.infer<typeof AuthSuccessSchema>;

export const MeSuccessSchema = z
  .object({
    success: z.literal(true),
    user: z
      .object({
        userId: z.number().int(),
        email: z.string(),
        iat: z.number().int(),
        exp: z.number().int(),
      })
      .strict(),
  })
  .strict();

export type MeSuccess = z.infer<typeof MeSuccessSchema>;

export interface Credentials {
  email: string;
  password: string;
}
