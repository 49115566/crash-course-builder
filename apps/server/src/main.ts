import type { Server } from 'node:http';

import type { Logger } from 'pino';

import { createAiProvider } from './adapters/ai/create-ai-provider.js';
import { FsLibraryRepository } from './adapters/fs/fs-library-repository.js';
import { FsSessionRepository } from './adapters/fs/fs-session-repository.js';
import { createSecretStore } from './adapters/secrets/create-secret-store.js';
import { SessionEventBus } from './app/event-bus.js';
import { GenerationCoordinator } from './app/generation-coordinator.js';
import { GenerationRunner } from './app/generation-runner.js';
import { LibraryService } from './app/library-service.js';
import { SessionService } from './app/session-service.js';
import { SessionStore } from './app/session-store.js';
import {
  launchBrowser,
  parseStartOptions,
  shouldOpenBrowser,
  verifyWebBuild,
} from './cli/startup.js';
import { assertSupportedNode, loadConfig } from './config.js';
import { createApp } from './http/app.js';
import { createLogger } from './logger.js';
import { APP_VERSION } from './version.js';

const SHUTDOWN_TIMEOUT_MS = 5_000;

interface ShutdownDependencies {
  sessionService: SessionService;
  coordinator: GenerationCoordinator;
  events: SessionEventBus;
}

function waitForIdle(coordinator: GenerationCoordinator, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;
    const check = (): void => {
      if (coordinator.getActiveSessionId() === null || Date.now() >= deadline) {
        resolve();
        return;
      }
      setTimeout(check, 25).unref();
    };
    check();
  });
}

function registerShutdown(
  server: Server,
  logger: Logger,
  dependencies: ShutdownDependencies,
): void {
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

    void (async () => {
      await dependencies.sessionService.shutdown();
      await waitForIdle(dependencies.coordinator, 2_000);
      dependencies.events.shutdown();

      server.close((error) => {
        clearTimeout(forceExit);

        if (error) {
          logger.error({ err: error }, 'HTTP server did not close cleanly');
          process.exitCode = 1;
          return;
        }

        logger.info('Shutdown complete');
      });
    })();
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
  const startOptions = parseStartOptions(process.argv.slice(2));

  if (startOptions.requireWebBuild) {
    const build = verifyWebBuild(config.webDistDir);
    if (!build.ok) {
      logger.fatal(build.message);
      process.exitCode = 1;
      return;
    }
  }
  const repository = new FsLibraryRepository({ root: config.libraryRoot });
  const libraryService = new LibraryService(repository);
  const secrets = createSecretStore(config, logger);
  const provider = createAiProvider(config, secrets, logger);
  const events = new SessionEventBus();
  const coordinator = new GenerationCoordinator();
  const sessionRepository = new FsSessionRepository({ dataDir: config.dataDir, logger });
  const sessionStore = new SessionStore(sessionRepository);
  const runner = new GenerationRunner({
    sessions: sessionStore,
    library: libraryService,
    provider,
    coordinator,
    events,
    logger,
    model: config.model,
  });
  const sessionService = new SessionService({
    sessions: sessionStore,
    library: libraryService,
    secrets,
    events,
    coordinator,
    runner,
    logger,
  });

  try {
    await libraryService.initialize();
  } catch (error) {
    logger.error(
      { err: error, libraryRoot: config.libraryRoot },
      'The course library could not be prepared. The API will start in a degraded state.',
    );
  }

  try {
    await sessionService.initialize();
  } catch (error) {
    logger.error(
      { err: error, dataDir: config.dataDir },
      'Session recovery failed. Generation may be unavailable until the data directory is repaired.',
    );
  }

  const app = createApp({
    config,
    logger,
    version: APP_VERSION,
    libraryService,
    sessionService,
    events,
    secrets,
  });

  const server = app.listen(config.port, '127.0.0.1', () => {
    const url = `http://127.0.0.1:${String(config.port)}`;
    logger.info(
      {
        version: APP_VERSION,
        url,
        libraryRoot: config.libraryRoot,
        dataDir: config.dataDir,
        model: config.model,
        deepseekBaseUrl: config.deepseekBaseUrl,
        library: libraryService.getReadiness().status,
      },
      'Crash Course Builder is listening',
    );

    if (shouldOpenBrowser(startOptions.openBrowser, process.env)) {
      launchBrowser(url, logger);
    }
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

  registerShutdown(server, logger, { sessionService, coordinator, events });
}

start().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown startup error';
  process.stderr.write(`Crash Course Builder could not start: ${message}\n`);
  process.exitCode = 1;
});
