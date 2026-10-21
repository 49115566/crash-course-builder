import { Router } from 'express';
import { HEALTH_PATH, type HealthData } from '@ccb/contracts';

import { getRequestId, sendSuccess } from '../response.js';

export function createSystemRouter(version: string): Router {
  const router = Router();

  router.get(HEALTH_PATH, (_req, res) => {
    const data: HealthData = {
      status: 'ok',
      version,
      uptimeSeconds: Math.floor(process.uptime()),
      checks: {
        process: { status: 'ok' },
        library: {
          status: 'unknown',
          message: 'Library readiness checks are not available yet.',
        },
        key: {
          status: 'unknown',
          message: 'Key readiness checks are not available yet.',
        },
      },
    };

    sendSuccess(res, data, getRequestId(res));
  });

  return router;
}
