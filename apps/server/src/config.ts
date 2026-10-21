import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import envPaths from 'env-paths';
import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const NODE_ENVS = ['development', 'test', 'production'] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  CCB_PORT: z.coerce.number().int().min(1).max(65535).default(4310),
  CCB_LIBRARY_ROOT: z.string().trim().min(1).optional(),
  CCB_DATA_DIR: z.string().trim().min(1).optional(),
  CCB_CONFIG_DIR: z.string().trim().min(1).optional(),
  CCB_MODEL: z.string().trim().min(1).default('deepseek-chat'),
  CCB_DEEPSEEK_BASE_URL: z
    .url()
    .default('https://api.deepseek.com')
    .transform((value) => value.replace(/\/+$/, '')),
  CCB_LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  CCB_WEB_DIST: z.string().trim().min(1).optional(),
});

export type NodeEnvironment = (typeof NODE_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  nodeEnv: NodeEnvironment;
  port: number;
  libraryRoot: string;
  dataDir: string;
  configDir: string;
  model: string;
  deepseekBaseUrl: string;
  logLevel: LogLevel;
  webDistDir: string;
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  homeDir?: string;
  cwd?: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const APP_DIR_NAME = 'crash-course-builder';
const defaultWebDistDir = fileURLToPath(new URL('../../web/dist/web/browser', import.meta.url));

function expandHome(value: string, homeDir: string): string {
  return value.replace(/^~(?=$|[\\/])/, homeDir);
}

function resolvePath(value: string, homeDir: string, cwd: string): string {
  return path.resolve(cwd, expandHome(value, homeDir));
}

export function loadConfig(options: LoadConfigOptions = {}): AppConfig {
  const env = options.env ?? process.env;
  const homeDir = options.homeDir ?? os.homedir();
  const cwd = options.cwd ?? process.cwd();
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid configuration: ${issues}`);
  }

  const values = parsed.data;
  const paths = envPaths(APP_DIR_NAME, { suffix: '' });

  return {
    nodeEnv: values.NODE_ENV,
    port: values.CCB_PORT,
    libraryRoot: resolvePath(values.CCB_LIBRARY_ROOT ?? '~/CrashCourses', homeDir, cwd),
    dataDir: resolvePath(values.CCB_DATA_DIR ?? paths.data, homeDir, cwd),
    configDir: resolvePath(values.CCB_CONFIG_DIR ?? paths.config, homeDir, cwd),
    model: values.CCB_MODEL,
    deepseekBaseUrl: values.CCB_DEEPSEEK_BASE_URL,
    logLevel: values.CCB_LOG_LEVEL,
    webDistDir: resolvePath(values.CCB_WEB_DIST ?? defaultWebDistDir, homeDir, cwd),
  };
}

export function assertSupportedNode(version: string = process.versions.node): void {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);

  if (!match) {
    throw new ConfigError(`Unable to understand Node.js version "${version}".`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const supported = (major === 24 && minor >= 15) || major >= 26;

  if (!supported) {
    throw new ConfigError(
      `Node.js ${version} is not supported. Install Node.js 24.15 or newer LTS (or Node.js 26+).`,
    );
  }
}
