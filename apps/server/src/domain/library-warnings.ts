import type { LibraryWarningCode, ScanWarning } from '@ccb/contracts';

export function libraryWarning(
  code: LibraryWarningCode,
  message: string,
  relativePath?: string,
): ScanWarning {
  return relativePath === undefined || relativePath.length === 0
    ? { code, message }
    : { code, message, path: relativePath };
}
