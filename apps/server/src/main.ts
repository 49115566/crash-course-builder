import type { Server } from 'node:http';

import type { Logger } from 'pino';

import { FsLibraryRepository } from './adapters/fs/fs-library-repository.js';
import { LibraryService } from './app/library-service.js';
import { assertSupportedNode, loadConfig } from './config.js';
import { createApp } from './http/app.js';
import { createLogger } from './logger.js';
import { APP_VERSION } from './version.js';

const SHUTDOWN_TIMEOUT_MS = 5_000;

function registerShutdown(server: Server, logger: Logger): void {
  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      logger.warn({ signal }, 'Shutdown already in progress');
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close((error) => {
      clearTimeout(forceExit);

      if (error) {
        logger.error({ err: error }, 'HTTP server did not close cleanly');
        process.exitCode = 1;
        return;
      }

      logger.info('Shutdown complete');
    });
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  process.on('uncaughtException', (error) => {
    process.exitCode = 1;
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });
  process.on('unhandledRejection', (reason) => {
    process.exitCode = 1;
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });
}

async function start(): Promise<void> {
  assertSupportedNode();
  const config = loadConfig();
  const logger = createLogger(config);
  const repository = new FsLibraryRepository({ root: config.libraryRoot });
  const libraryService = new LibraryService(repository);

  try {
    await libraryService.initialize();
  } catch (error) {
    logger.error(
      { err: error, libraryRoot: config.libraryRoot },
      'The course library could not be prepared. The API will start in a degraded state.',
    );
  }

  const app = createApp({ config, logger, version: APP_VERSION, libraryService });

  const server = app.listen(config.port, '127.0.0.1', () => {
    logger.info(
      {
        version: APP_VERSION,
        url: `http://127.0.0.1:${config.port}`,
        libraryRoot: config.libraryRoot,
        dataDir: config.dataDir,
        model: config.model,
        deepseekBaseUrl: config.deepseekBaseUrl,
        library: libraryService.getReadiness().status,
      },
      'Crash Course Builder is listening',
    );
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.fatal(
        { port: config.port },
        `Port ${config.port} is already in use. Stop the other process or set CCB_PORT.`,
      );
    } else if (error.code === 'EACCES') {
      logger.fatal(
        { port: config.port },
        `Permission denied while binding port ${config.port}. Choose a port above 1024.`,
      );
    } else {
      logger.fatal({ err: error }, 'The HTTP server failed to start');
    }

    process.exitCode = 1;
  });

  registerShutdown(server, logger);
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(`Crash Course Builder could not start: ${message}\n`);
  process.exitCode = 1;
});
