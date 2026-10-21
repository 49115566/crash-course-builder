import path from 'node:path';

export function e2eRoot(name = 'main'): string {
  return path.resolve(process.cwd(), '.tmp', 'e2e', name);
}

export function libraryRoot(name = 'main'): string {
  return path.join(e2eRoot(name), 'library');
}
