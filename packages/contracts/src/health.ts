import { z } from 'zod';

export const healthCheckStatusSchema = z.enum(['ok', 'degraded', 'unknown']);
export type HealthCheckStatus = z.infer<typeof healthCheckStatusSchema>;

export const healthCheckSchema = z.object({
  status: healthCheckStatusSchema,
  message: z.string().min(1).optional(),
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;

export const healthDataSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string().min(1),
  uptimeSeconds: z.number().int().nonnegative(),
  checks: z.object({
    process: healthCheckSchema,
    library: healthCheckSchema,
    key: healthCheckSchema,
  }),
});

export type HealthData = z.infer<typeof healthDataSchema>;
