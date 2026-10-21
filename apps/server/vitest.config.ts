import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/version.ts', 'src/test/**'],
      thresholds: {
        'src/domain/**/*.ts': {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 80,
        },
        'src/app/**/*.ts': {
          lines: 90,
          functions: 90,
          statements: 90,
          branches: 60,
        },
      },
    },
  },
});
