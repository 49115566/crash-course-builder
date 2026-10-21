import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import express, { type Express, type RequestHandler } from 'express';
import type { Logger } from 'pino';
import { API_PREFIX } from '@ccb/contracts';

const HASHED_ASSET_PATTERN =
  /-[A-Za-z0-9_-]{8,}\.(?:avif|css|eot|gif|ico|jpe?g|js|json|map|mjs|otf|png|svg|ttf|webp|woff2?)$/i;
const CSP_NONCE_ATTRIBUTE = /\sngCspNonce="[^"]*"/gi;

export interface StaticRouteOptions {
  nonce: string;
}

function isApiPath(requestPath: string): boolean {
  return requestPath === API_PREFIX || requestPath.startsWith(`${API_PREFIX}/`);
}

function isImmutableAsset(filePath: string): boolean {
  return (
    HASHED_ASSET_PATTERN.test(path.basename(filePath)) || filePath.split(path.sep).includes('media')
  );
}

export function renderIndexTemplate(template: string, nonce: string): string {
  return template.replace(/<ccb-root\b([^>]*)>/i, (_match, attributes: string) => {
    const cleaned = attributes.replace(CSP_NONCE_ATTRIBUTE, '').trim();
    return `<ccb-root${cleaned.length === 0 ? '' : ` ${cleaned}`} ngCspNonce="${nonce}">`;
  });
}

export function registerStaticRoutes(
  app: Express,
  webDistDir: string,
  logger: Logger,
  options: StaticRouteOptions,
): boolean {
  const indexPath = path.join(webDistDir, 'index.html');

  if (!existsSync(indexPath)) {
    logger.warn(
      { webDistDir },
      'Web build not found. The API is available, but no browser application will be served.',
    );
    return false;
  }

  const indexTemplate = readFileSync(indexPath, 'utf8');
  const indexHtml = renderIndexTemplate(indexTemplate, options.nonce);

  const sendIndex: RequestHandler = (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(indexHtml);
  };

  app.get(['/index.html', '/index.htm'], sendIndex);

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

    sendIndex(req, res, next);
  });

  return true;
}
