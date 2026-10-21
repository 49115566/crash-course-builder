import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';
import type { Logger } from 'pino';

import { writeJsonAtomic } from '../fs/atomic.js';
import { lstatIfExists } from '../fs/fs-paths.js';

const credentialsSchema = z
  .object({
    schemaVersion: z.literal(1),
    deepseekApiKey: z.string().min(1),
  })
  .strict();

type CredentialsFile = z.infer<typeof credentialsSchema>;

const CREDENTIALS_FILE = 'credentials.json';

export class ConfigSecretStore {
  private readonly filePath: string;
  private warnedAboutPermissions = false;

  constructor(
    configDir: string,
    private readonly logger: Logger,
  ) {
    this.filePath = path.join(configDir, CREDENTIALS_FILE);
  }

  async get(): Promise<string | null> {
    const fileStats = await lstatIfExists(this.filePath);

    if (!fileStats.exists) {
      return null;
    }

    if (!fileStats.isFile || fileStats.isSymbolicLink) {
      this.logger.warn('The credential fallback file is not a regular file and will not be used.');
      return null;
    }

    try {
      const mode = (await stat(this.filePath)).mode & 0o777;
      if ((mode & 0o077) !== 0 && !this.warnedAboutPermissions) {
        this.warnedAboutPermissions = true;
        this.logger.warn(
          { path: this.filePath, mode: mode.toString(8) },
          'The credential fallback file is readable by other users. Run npm run key:set to repair it.',
        );
      }

      const parsed = credentialsSchema.safeParse(JSON.parse(await readFile(this.filePath, 'utf8')));

      if (!parsed.success) {
        this.logger.warn('The credential fallback file has an unsupported shape.');
        return null;
      }

      return parsed.data.deepseekApiKey;
    } catch {
      this.logger.warn('The credential fallback file could not be read.');
      return null;
    }
  }

  async set(key: string): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const value: CredentialsFile = { schemaVersion: 1, deepseekApiKey: key };
    await writeJsonAtomic(this.filePath, value);
  }

  async remove(): Promise<boolean> {
    const fileStats = await lstatIfExists(this.filePath);

    if (!fileStats.exists) {
      return false;
    }

    await rm(this.filePath, { force: true });
    return true;
  }
}
