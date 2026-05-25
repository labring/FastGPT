import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Keep this helper local to the app project because the app Docker build context
 * does not include the repository root `test/` directory, but Next still
 * type-checks this config during image builds.
 */
const getTestMaxWorkers = () => {
  const raw = process.env.FASTGPT_TEST_MAX_WORKERS;
  if (!raw) return 4;
  if (raw.endsWith('%')) return raw as `${number}%`;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 4;
};

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src'),
      '@fastgpt-sdk/storage': resolve('../../sdk/storage/src/index.ts'),
      '@fastgpt-sdk/otel/logger': resolve('../../sdk/otel/src/logger-entry.ts'),
      '@fastgpt-sdk/otel/metrics': resolve('../../sdk/otel/src/metrics-entry.ts'),
      '@fastgpt-sdk/otel/tracing': resolve('../../sdk/otel/src/tracing-entry.ts'),
      '@fastgpt-sdk/otel': resolve('../../sdk/otel/src/index.ts'),
      '@fastgpt': resolve('../../packages'),
      '#fastgpt/app/test': resolve('test'),
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
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['src/**/*.ts', 'src/**/*.tsx'],
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
    reporters: ['github-actions', 'default'],
    include: ['test/**/*.test.ts']
  }
});
