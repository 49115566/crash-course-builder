import { readFileSync } from 'node:fs';

function readRootPackageVersion(): string {
  try {
    const contents = readFileSync(new URL('../../../package.json', import.meta.url), 'utf8');
    const parsed: unknown = JSON.parse(contents);

    if (typeof parsed === 'object' && parsed !== null && 'version' in parsed) {
      const version = parsed.version;
      if (typeof version === 'string' && version.length > 0) {
        return version;
      }
    }
  } catch {
    return '0.0.0';
  }

  return '0.0.0';
}

export const APP_VERSION = readRootPackageVersion();
