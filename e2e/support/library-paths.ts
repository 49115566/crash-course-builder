import path from 'node:path';

export function e2eRoot(): string {
  return path.resolve(process.cwd(), '.tmp', 'e2e');
}

export function libraryRoot(): string {
  return path.join(e2eRoot(), 'library');
}
