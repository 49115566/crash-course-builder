import { randomUUID } from 'node:crypto';

import express, { type Express, type Response } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { API_PREFIX, HEALTH_PATH, REQUEST_ID_HEADER } from '@ccb/contracts';

import type { LibraryService } from '../app/library-service.js';
import type { AppConfig } from '../config.js';
import { NotFoundError, createErrorHandler } from './errors.js';
import { getRequestId } from './response.js';
import { createLibraryRouter } from './routes/library.routes.js';
import { createSystemRouter } from './routes/system.routes.js';
import { apiNoStore, securityHeaders } from './security.js';
import { registerStaticRoutes } from './static.js';

export interface AppDependencies {
  config: AppConfig;
  logger: Logger;
  version: string;
  libraryService: LibraryService;
}

export function createApp({ config, logger, version, libraryService }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');

  app.use((_req, res, next) => {
    const requestId = randomUUID();
    res.locals['requestId'] = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);
    next();
  });

  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => getRequestId(res as Response),
      autoLogging: {
        ignore: (req) => req.url?.split('?')[0] === `${API_PREFIX}${HEALTH_PATH}`,
      },
      customLogLevel: (_req, res, error) => {
        if (error !== undefined || res.statusCode >= 500) {
          return 'error';
        }
        if (res.statusCode >= 400) {
          return 'warn';
        }
        return 'info';
      },
    }),
  );

  app.use(securityHeaders);
  app.use(API_PREFIX, apiNoStore);
  app.use(express.json({ limit: '64kb', strict: true }));

  app.use(
    API_PREFIX,
    createSystemRouter(version, () => libraryService.getReadiness()),
  );
  app.use(API_PREFIX, createLibraryRouter(libraryService));

  app.use(API_PREFIX, (_req, _res, next) => {
    next(new NotFoundError('The API route could not be found.'));
  });

  registerStaticRoutes(app, config.webDistDir, logger);

  app.use((_req, res) => {
    res.status(404).type('text/plain').send('Not found');
  });

  app.use(createErrorHandler(logger));

  return app;
}
