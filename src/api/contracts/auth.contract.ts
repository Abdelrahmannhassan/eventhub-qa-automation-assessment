import { z } from 'zod';

const authUserShape = { id: z.number().int(), email: z.string() };

const authSuccessShape = {
  success: z.literal(true),
  token: z.string().min(1),
  user: z.object(authUserShape),
};

export const AuthSuccessSchema = z.object(authSuccessShape);
export const StrictAuthSuccessSchema = z.strictObject({
  ...authSuccessShape,
  user: z.strictObject(authUserShape),
});

export type AuthSuccess = z.infer<typeof AuthSuccessSchema>;

const meUserShape = {
  userId: z.number().int(),
  email: z.string(),
  iat: z.number().int(),
  exp: z.number().int(),
};

const meSuccessShape = { success: z.literal(true), user: z.object(meUserShape) };

export const MeSuccessSchema = z.object(meSuccessShape);
export const StrictMeSuccessSchema = z.strictObject({
  ...meSuccessShape,
  user: z.strictObject(meUserShape),
});

export type MeSuccess = z.infer<typeof MeSuccessSchema>;

export interface Credentials {
  email: string;
  password: string;
}

/** `GET /health` — unauthenticated. */
const healthShape = {
  status: z.string(),
  timestamp: z.string(),
  dbStatus: z.string(),
};

export const HealthSuccessSchema = z.object(healthShape);
export const StrictHealthSuccessSchema = z.strictObject(healthShape);
export type HealthSuccess = z.infer<typeof HealthSuccessSchema>;

/** `GET /config` — unauthenticated public feature flags. */
const configShape = { showExploreLinks: z.boolean() };

export const ConfigSuccessSchema = z.object(configShape);
export const StrictConfigSuccessSchema = z.strictObject(configShape);
export type ConfigSuccess = z.infer<typeof ConfigSuccessSchema>;
