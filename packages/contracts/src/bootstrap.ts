import { z } from 'zod';

export const KEY_SOURCES = ['environment', 'keychain', 'config', 'none'] as const;

export type KeySource = (typeof KEY_SOURCES)[number];

export const keySourceSchema = z.enum(KEY_SOURCES);

export const keyStatusSchema = z.object({
  configured: z.boolean(),
  source: keySourceSchema,
});

export type KeyStatus = z.infer<typeof keyStatusSchema>;

export const bootstrapDataSchema = z.object({
  version: z.string().min(1),
  libraryRoot: z.string().min(1),
  library: z.object({
    status: z.enum(['ok', 'degraded']),
    message: z.string().min(1).optional(),
  }),
  provider: z.literal('deepseek'),
  model: z.string().min(1),
  key: keyStatusSchema,
});

export type BootstrapData = z.infer<typeof bootstrapDataSchema>;
