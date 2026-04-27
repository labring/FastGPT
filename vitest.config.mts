import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('projects/app/src'),
      '@fastgpt-sdk/logger': resolve('sdk/logger/src/index.ts'),
      '@fastgpt-sdk/storage': resolve('sdk/storage/src/index.ts'),
      '@fastgpt-sdk/otel/logger': resolve('sdk/otel/src/logger-entry.ts'),
      '@fastgpt-sdk/otel/metrics': resolve('sdk/otel/src/metrics-entry.ts'),
      '@fastgpt-sdk/otel/tracing': resolve('sdk/otel/src/tracing-entry.ts'),
      '@fastgpt-sdk/otel': resolve('sdk/otel/src/index.ts'),
      '@fastgpt': resolve('packages'),
      '@test': resolve('test')
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
      reporter: ['html', 'json-summary', 'json'],
      // reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['projects/app/**/*.ts', 'packages/**/*.ts'],
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
        '**/*/*.schema.ts',
        'packages/global/openapi/**/*',
        'packages/global/core/workflow/template/**/*'
      ],
      cleanOnRerun: false
    },
    outputFile: 'test-results.json',
    setupFiles: 'test/setup.ts',
    globalSetup: 'test/globalSetup.ts',
    // File-level execution: serial (one file at a time to avoid MongoDB conflicts)
    fileParallelism: false,
    // Test-level execution within a file: parallel (up to 5 concurrent tests)
    maxConcurrency: 10,
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 30000,
    passWithNoTests: true,
    reporters: ['github-actions', 'default'],
    include: ['test/**/*.test.ts']
  }
});
