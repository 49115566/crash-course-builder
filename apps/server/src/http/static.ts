import { existsSync } from 'node:fs';
import path from 'node:path';

import express, { type Express } from 'express';
import type { Logger } from 'pino';
import { API_PREFIX } from '@ccb/contracts';

const HASHED_ASSET_PATTERN = /-[A-Z0-9]{8}\.(?:css|js|otf|ttf|woff2?)$/;

function isApiPath(requestPath: string): boolean {
  return requestPath === API_PREFIX || requestPath.startsWith(`${API_PREFIX}/`);
}

function isImmutableAsset(filePath: string): boolean {
  return (
    HASHED_ASSET_PATTERN.test(path.basename(filePath)) || filePath.split(path.sep).includes('media')
  );
}

export function registerStaticRoutes(app: Express, webDistDir: string, logger: Logger): void {
  const indexPath = path.join(webDistDir, 'index.html');

  if (!existsSync(indexPath)) {
    logger.warn(
      { webDistDir },
      'Web build not found. The API is available, but no browser application will be served.',
    );
    return;
  }

  app.use(
    express.static(webDistDir, {
      index: false,
      fallthrough: true,
      dotfiles: 'ignore',
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === 'index.html') {
          res.setHeader('Cache-Control', 'no-store');
          return;
        }

        res.setHeader(
          'Cache-Control',
          isImmutableAsset(filePath)
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=3600',
        );
      },
    }),
  );

  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }

    if (isApiPath(req.path) || !req.accepts('html') || path.extname(req.path) !== '') {
      next();
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(indexPath, (error) => {
      if (error) {
        next(error);
      }
    });
  });
}
