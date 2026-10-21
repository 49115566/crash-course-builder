import pino, { type DestinationStream, type Logger, type LoggerOptions } from 'pino';

import type { AppConfig } from './config.js';

export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'apiKey',
  '*.apiKey',
  'key',
  '*.key',
  'secret',
  '*.secret',
  'password',
  '*.password',
  'DEEPSEEK_API_KEY',
  '*.DEEPSEEK_API_KEY',
];

export function createLogger(
  config: Pick<AppConfig, 'logLevel'>,
  destination?: DestinationStream,
): Logger {
  const options: LoggerOptions = {
    level: config.logLevel,
    base: { app: 'crash-course-builder' },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
      paths: [...REDACT_PATHS],
      censor: '[Redacted]',
    },
  };

  return destination ? pino(options, destination) : pino(options);
}
