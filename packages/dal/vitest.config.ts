import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@fastgpt-sdk/otel/logger': resolve('../../sdk/otel/src/logger-entry.ts'),
      '@fastgpt': resolve('..')
    }
  },
  test: {
    globalSetup: resolve(import.meta.dirname, 'test/global-setup.ts'),
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['redis/**/*.ts'],
      exclude: ['**/test/**', '**/*.test.ts', '**/index.ts'],
      cleanOnRerun: false
    },
    outputFile: 'test-results.json',
    include: ['test/**/*.test.ts']
  }
});
