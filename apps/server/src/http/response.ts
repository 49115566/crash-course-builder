import type { Response } from 'express';
import type { ApiSuccess, ScanWarning } from '@ccb/contracts';

export function getRequestId(res: Response): string {
  const requestId: unknown = res.locals['requestId'];
  return typeof requestId === 'string' ? requestId : '';
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  requestId: string,
  warnings?: ScanWarning[],
  status = 200,
): void {
  const body: ApiSuccess<T> = { data, requestId };

  if (warnings !== undefined && warnings.length > 0) {
    body.warnings = warnings;
  }

  res.status(status).json(body);
}
