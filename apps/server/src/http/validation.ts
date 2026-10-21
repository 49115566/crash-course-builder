import type { Request } from 'express';
import type { z } from 'zod';

import { subjectIdSchema } from '@ccb/contracts';

export function parseBody<T>(request: Request, schema: z.ZodType<T>): T {
  return schema.parse(request.body);
}

export function parseSubjectId(request: Request): string {
  return subjectIdSchema.parse(request.params['id']);
}

export function parseCourseId(request: Request): string {
  return subjectIdSchema.parse(request.params['id']);
}
