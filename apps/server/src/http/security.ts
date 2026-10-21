import { randomBytes } from 'node:crypto';

import type { RequestHandler } from 'express';
import { MUTATION_HEADER_NAME, MUTATION_HEADER_VALUE } from '@ccb/contracts';

import { AppError } from './errors.js';

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);
const DEVELOPMENT_ORIGIN_PORTS = new Set([4200]);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const HOST_PATTERN = /^([a-z0-9.-]+)(?::(\d+))?$/i;

export interface LocalRequestGuardOptions {
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
}

export function createCspNonce(): string {
  return randomBytes(18).toString('base64');
}

function forbidden(message: string): AppError {
  return new AppError('FORBIDDEN', message, { status: 403, retryable: false });
}

function isAllowedHost(hostHeader: string | undefined, port: number): boolean {
  if (hostHeader === undefined) {
    return false;
  }

  const match = HOST_PATTERN.exec(hostHeader.trim());
  if (match === null) {
    return false;
  }

  const hostname = match[1]?.toLowerCase() ?? '';
  if (!LOOPBACK_HOSTNAMES.has(hostname)) {
    return false;
  }

  const hostPort = match[2] === undefined ? null : Number(match[2]);

  if (port === 0) {
    return hostPort === null || hostPort > 0;
  }

  return hostPort === port;
}

function isAllowedOrigin(
  origin: string,
  port: number,
  nodeEnv: LocalRequestGuardOptions['nodeEnv'],
): boolean {
  if (origin === 'null') {
    return false;
  }

  let parsed: URL;

  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }

  if (!LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    return false;
  }

  if (parsed.origin !== origin) {
    return false;
  }

  if (port === 0) {
    return true;
  }

  const originPort =
    parsed.port === '' ? (parsed.protocol === 'https:' ? 443 : 80) : Number(parsed.port);

  if (originPort === port) {
    return true;
  }

  return nodeEnv !== 'production' && DEVELOPMENT_ORIGIN_PORTS.has(originPort);
}

export function createSecurityHeaders(nonce: string): RequestHandler {
  const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "script-src-attr 'none'",
    `style-src 'self' 'nonce-${nonce}'`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join('; ');

  return (_req, res, next) => {
    res.setHeader('Content-Security-Policy', contentSecurityPolicy);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    next();
  };
}

export function createLocalRequestGuard({
  port,
  nodeEnv,
}: LocalRequestGuardOptions): RequestHandler {
  return (req, _res, next) => {
    if (!isAllowedHost(req.headers.host, port)) {
      next(
        forbidden('This local service only accepts requests addressed to localhost or 127.0.0.1.'),
      );
      return;
    }

    const origin = req.headers.origin;

    if (origin !== undefined && !isAllowedOrigin(origin, port, nodeEnv)) {
      next(forbidden('The request origin is not allowed.'));
      return;
    }

    next();
  };
}

export function requireMutationHeader(): RequestHandler {
  return (req, _res, next) => {
    if (!MUTATING_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    if (req.get(MUTATION_HEADER_NAME) !== MUTATION_HEADER_VALUE) {
      next(
        forbidden(
          `This request must include the ${MUTATION_HEADER_NAME}: ${MUTATION_HEADER_VALUE} header.`,
        ),
      );
      return;
    }

    next();
  };
}

export const apiNoStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};
