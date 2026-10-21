import type { Writable } from 'node:stream';

import { createSecretStore } from '../adapters/secrets/create-secret-store.js';
import { loadConfig } from '../config.js';
import { createLogger } from '../logger.js';
import { runDoctor, type DoctorResult } from './doctor-check.js';
import { validateDeepSeekKey } from './key-validation.js';
import { readSecretInput, type SecretInputOptions } from './secret-input.js';

export interface CliContext {
  stdout: Writable;
  stderr: Writable;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  secretInput?: SecretInputOptions;
}

function writeLine(stream: Writable, message: string): void {
  stream.write(`${message}\n`);
}

function defaultContext(overrides: Partial<CliContext> = {}): CliContext {
  return {
    stdout: overrides.stdout ?? process.stdout,
    stderr: overrides.stderr ?? process.stderr,
    ...(overrides.env === undefined ? {} : { env: overrides.env }),
    ...(overrides.fetchImpl === undefined ? {} : { fetchImpl: overrides.fetchImpl }),
    ...(overrides.secretInput === undefined ? {} : { secretInput: overrides.secretInput }),
  };
}

export async function setKeyCommand(overrides: Partial<CliContext> = {}): Promise<number> {
  const context = defaultContext(overrides);
  const env = context.env ?? process.env;
  const config = loadConfig({ env });
  const logger = createLogger({ logLevel: 'silent' });
  const secretStore = createSecretStore(config, logger, env);

  try {
    writeLine(context.stdout, 'Paste your DeepSeek API key (input is hidden):');
    const key = await readSecretInput(context.secretInput);
    const validation = await validateDeepSeekKey({
      baseUrl: config.deepseekBaseUrl,
      key,
      ...(context.fetchImpl === undefined ? {} : { fetchImpl: context.fetchImpl }),
    });

    if (!validation.valid) {
      writeLine(context.stderr, validation.message);
      writeLine(context.stderr, 'The key was not saved.');
      return 1;
    }

    const result = await secretStore.setKey(key);
    writeLine(context.stdout, `Key saved via ${result.source}.`);

    if (result.warning !== undefined) {
      writeLine(context.stderr, result.warning);
    }

    return 0;
  } catch (error) {
    writeLine(
      context.stderr,
      error instanceof Error ? error.message : 'The key could not be saved.',
    );
    return 1;
  }
}

export async function keyStatusCommand(overrides: Partial<CliContext> = {}): Promise<number> {
  const context = defaultContext(overrides);
  const env = context.env ?? process.env;
  const config = loadConfig({ env });
  const logger = createLogger({ logLevel: 'silent' });
  const secretStore = createSecretStore(config, logger, env);
  const resolved = await secretStore.resolve();

  if (resolved === null) {
    writeLine(context.stdout, 'No DeepSeek key is configured.');
    writeLine(context.stdout, 'Run npm run key:set to add one.');
    return 1;
  }

  const validation = await validateDeepSeekKey({
    baseUrl: config.deepseekBaseUrl,
    key: resolved.key,
    ...(context.fetchImpl === undefined ? {} : { fetchImpl: context.fetchImpl }),
  });

  writeLine(context.stdout, `Key source: ${resolved.source}`);
  writeLine(context.stdout, validation.message);
  return validation.valid ? 0 : 1;
}

export async function removeKeyCommand(overrides: Partial<CliContext> = {}): Promise<number> {
  const context = defaultContext(overrides);
  const env = context.env ?? process.env;
  const config = loadConfig({ env });
  const logger = createLogger({ logLevel: 'silent' });
  const secretStore = createSecretStore(config, logger, env);
  const result = await secretStore.removeKey();

  if (result.removed) {
    writeLine(context.stdout, 'The stored DeepSeek key was removed.');
  } else {
    writeLine(context.stdout, 'No stored DeepSeek key was found.');
  }

  if (result.environmentStillSet) {
    writeLine(
      context.stderr,
      'DEEPSEEK_API_KEY is still set in the environment. Unset it to stop using that key.',
    );
  }

  if (result.warning !== undefined) {
    writeLine(context.stderr, result.warning);
  }

  return 0;
}

export async function doctorCommand(overrides: Partial<CliContext> = {}): Promise<number> {
  const context = defaultContext(overrides);
  let result: DoctorResult;

  try {
    result = await runDoctor();
  } catch (error) {
    writeLine(context.stderr, error instanceof Error ? error.message : 'The doctor could not run.');
    return 1;
  }

  for (const check of result.checks) {
    writeLine(context.stdout, `${check.ok ? 'OK' : 'FAIL'}  ${check.name}: ${check.detail}`);
  }

  writeLine(context.stdout, result.ok ? 'Doctor found no problems.' : 'Doctor found problems.');
  return result.ok ? 0 : 1;
}
