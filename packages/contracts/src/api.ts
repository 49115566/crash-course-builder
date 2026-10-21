import { z } from 'zod';

export const scanWarningSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().min(1).optional(),
});

export type ScanWarning = z.infer<typeof scanWarningSchema>;

export interface ApiSuccess<T> {
  data: T;
  warnings?: ScanWarning[];
  requestId: string;
}

export const apiSuccessSchema = <T extends z.ZodType>(data: T) =>
  z.object({
    data,
    warnings: z.array(scanWarningSchema).optional(),
    requestId: z.string().min(1),
  });
