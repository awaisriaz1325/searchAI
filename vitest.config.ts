import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'bench/test/**/*.test.ts'],
          exclude: ['**/*.integration.test.ts', '**/*.model.test.ts', '**/node_modules/**'],
        },
      },
      {
        test: {
          name: 'integration',
          include: ['**/*.integration.test.ts'],
          exclude: ['**/node_modules/**'],
          testTimeout: 60_000,
          hookTimeout: 120_000,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: 'model',
          include: ['**/*.model.test.ts'],
          exclude: ['**/node_modules/**'],
          testTimeout: 600_000,
          hookTimeout: 600_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
