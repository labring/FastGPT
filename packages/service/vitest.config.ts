import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('../../projects/app/src'),
      '@fastgpt': resolve('..'),
      '@repo-test': resolve('../../test')
    }
  },
  test: {
    env: {
      FILE_TOKEN_KEY:
        process.env.FILE_TOKEN_KEY ??
        'bfd697e7e798f75deaf2d31210bc93a2e41ad4eed9e7831071d77821b7b97cff'
    },
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      all: false,
      include: ['common/**/*.ts', 'core/**/*.ts', 'support/**/*.ts', 'worker/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/*.spec.ts',
        '**/*/*.d.ts',
        '**/test/**',
        '**/*.test.ts',
        '**/*/constants.ts',
        '**/*/*.const.ts',
        '**/*/type.ts',
        '**/*/types.ts',
        '**/*/type/*',
        '**/*/schema.ts',
        '**/*/*.schema.ts'
      ],
      cleanOnRerun: false
    },
    outputFile: 'test-results.json',
    setupFiles: '../../test/setup.ts',
    globalSetup: '../../test/globalSetup.ts',
    fileParallelism: false,
    maxConcurrency: 10,
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 30000,
    exclude: [...configDefaults.exclude, 'test/integrations/**/*.test.ts'],
    reporters: ['github-actions', 'default'],
    include: ['test/**/*.test.ts']
  }
});
