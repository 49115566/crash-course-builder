import { Router } from 'express';
import { HEALTH_PATH, type HealthData } from '@ccb/contracts';

import type { LibraryReadiness } from '../../app/library-service.js';
import { getRequestId, sendSuccess } from '../response.js';

export function createSystemRouter(
  version: string,
  getLibraryReadiness: () => LibraryReadiness,
): Router {
  const router = Router();

  router.get(HEALTH_PATH, (_req, res) => {
    const library = getLibraryReadiness();
    const data: HealthData = {
      status: library.status === 'ok' ? 'ok' : 'degraded',
      version,
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {
        process: { status: 'ok' },
        library: {
          status: library.status,
          ...(library.message === undefined ? {} : { message: library.message }),
        },
        key: {
          status: 'unknown',
          message: 'Key readiness checks are available from Milestone 3 onward.',
        },
      },
    };

    sendSuccess(res, data, getRequestId(res));
  });

  return router;
}
