import { Router } from 'express';
import { HEALTH_PATH, type BootstrapData, type HealthData } from '@ccb/contracts';

import type { LibraryReadiness } from '../../app/library-service.js';
import type { AppConfig } from '../../config.js';
import type { SecretStore } from '../../ports/secret-store.js';
import { asyncHandler } from '../async-handler.js';
import { getRequestId, sendSuccess } from '../response.js';

export function createSystemRouter(
  version: string,
  config: Pick<AppConfig, 'libraryRoot' | 'model' | 'deepseekBaseUrl'>,
  getLibraryReadiness: () => LibraryReadiness,
  secrets: SecretStore,
): Router {
  const router = Router();

  router.get(
    '/bootstrap',
    asyncHandler(async (_request, response) => {
      const library = getLibraryReadiness();
      const key = await secrets.describe();
      const data: BootstrapData = {
        version,
        libraryRoot: config.libraryRoot,
        library: {
          status: library.status,
          ...(library.message === undefined ? {} : { message: library.message }),
        },
        provider: 'deepseek',
        model: config.model,
        key,
      };

      sendSuccess(response, data, getRequestId(response));
    }),
  );

  router.get(
    HEALTH_PATH,
    asyncHandler(async (_request, response) => {
      const library = getLibraryReadiness();
      const key = await secrets.describe();
      const degraded = library.status !== 'ok' || !key.configured;
      const data: HealthData = {
        status: degraded ? 'degraded' : 'ok',
        version,
        uptimeSeconds: Math.floor(process.uptime()),
        checks: {
          process: { status: 'ok' },
          library: {
            status: library.status,
            ...(library.message === undefined ? {} : { message: library.message }),
          },
          key: key.configured
            ? { status: 'ok', message: `Configured via ${key.source}.` }
            : {
                status: 'degraded',
                message: 'No DeepSeek API key is configured. Run npm run key:set.',
              },
        },
      };

      sendSuccess(response, data, getRequestId(response));
    }),
  );

  return router;
}
