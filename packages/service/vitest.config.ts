import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';
import { getTestMaxWorkers } from '../../test/vitestWorkers';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('../../projects/app/src'),
      '@fastgpt-sdk/storage': resolve('../../sdk/storage/src/index.ts'),
      '@fastgpt-sdk/otel/logger': resolve('../../sdk/otel/src/logger-entry.ts'),
      '@fastgpt-sdk/otel/metrics': resolve('../../sdk/otel/src/metrics-entry.ts'),
      '@fastgpt-sdk/otel/tracing': resolve('../../sdk/otel/src/tracing-entry.ts'),
      '@fastgpt-sdk/otel': resolve('../../sdk/otel/src/index.ts'),
      '@fastgpt': resolve('..'),
      '@test': resolve('../../test')
    }
  },
  test: {
    env: {
      FILE_TOKEN_KEY:
        process.env.FILE_TOKEN_KEY ??
        'bfd697e7e798f75deaf2d31210bc93a2e41ad4eed9e7831071d77821b7b97cff',
      AES256_SECRET_KEY: process.env.AES256_SECRET_KEY ?? 'fastgpt_test_aes256_secret_key'
    },
    coverage: {
      enabled: true,
      reporter: ['html', 'json-summary', 'json'],
      reportOnFailure: true,
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
    fileParallelism: true,
    maxWorkers: getTestMaxWorkers(),
    maxConcurrency: 10,
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 30000,
    exclude: [...configDefaults.exclude, 'test/integrations/**/*.test.ts'],
    reporters: ['github-actions', 'default'],
    include: ['test/**/*.test.ts']
  }
});
