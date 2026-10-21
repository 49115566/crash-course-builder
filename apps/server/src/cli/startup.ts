import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

import type { Logger } from 'pino';

export interface StartOptions {
  requireWebBuild: boolean;
  openBrowser: boolean;
}

export interface BuildCheck {
  ok: boolean;
  message: string;
}

export interface BrowserCommand {
  command: string;
  args: string[];
}

export function parseStartOptions(args: readonly string[]): StartOptions {
  const flags = new Set(args);
  return {
    requireWebBuild: flags.has('--require-web-build'),
    openBrowser: flags.has('--open') && !flags.has('--no-open'),
  };
}

export function shouldOpenBrowser(requested: boolean, env: NodeJS.ProcessEnv): boolean {
  return (
    requested &&
    env['CI'] !== 'true' &&
    env['CI'] !== '1' &&
    env['CCB_NO_OPEN'] !== '1' &&
    env['NODE_ENV'] !== 'test'
  );
}

export function verifyWebBuild(webDistDir: string): BuildCheck {
  const indexPath = path.join(webDistDir, 'index.html');

  if (!existsSync(indexPath)) {
    return {
      ok: false,
      message: `The Angular build was not found at ${webDistDir}. Run "npm run build" before starting the production server.`,
    };
  }

  return { ok: true, message: `Web build found at ${webDistDir}.` };
}

export function browserCommand(
  url: string,
  platform: NodeJS.Platform = process.platform,
): BrowserCommand {
  if (platform === 'darwin') {
    return { command: 'open', args: [url] };
  }

  if (platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', '', url] };
  }

  return { command: 'xdg-open', args: [url] };
}

export function launchBrowser(url: string, logger: Logger): void {
  const { command, args } = browserCommand(url);

  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.once('error', (error) => {
      logger.warn(
        { err: error, url },
        `The browser could not be opened automatically. Open ${url} manually.`,
      );
    });
    child.unref();
  } catch (error) {
    logger.warn(
      { err: error, url },
      `The browser could not be opened automatically. Open ${url} manually.`,
    );
  }
}
