import path from 'node:path';

const fallbackRoot = path.resolve(process.cwd(), '.tmp', 'e2e', 'main');

export function e2eRoot(): string {
  const active = process.env['CCB_E2E_ROOT'];

  return active === undefined || active.length === 0 ? fallbackRoot : path.resolve(active);
}

export function libraryRoot(): string {
  return path.join(e2eRoot(), 'library');
}
