import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('..'),
      '@fastgpt-sdk/logger': resolve('../../sdk/logger/src/index.ts'),
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
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['common/**/*.ts', 'core/**/*.ts', 'support/**/*.ts', 'openapi/**/*.ts'],
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
        'openapi/**/*',
        'core/workflow/template/**/*'
      ],
      cleanOnRerun: false
    },
    outputFile: 'test-results.json',
    include: ['test/**/*.test.ts']
  }
});
