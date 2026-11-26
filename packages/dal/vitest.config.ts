import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { blockPrivateDalRepoImports } from './vitestBoundary';

export default defineConfig({
  plugins: [blockPrivateDalRepoImports()],
  resolve: {
    alias: {
      '@fastgpt-sdk/otel/logger': resolve('../../sdk/otel/src/logger-entry.ts'),
      '@fastgpt': resolve('..')
    }
  },
  test: {
    globalSetup: resolve(import.meta.dirname, 'test/global-setup.ts'),
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['redis/**/*.ts', 'db/**/*.ts'],
      exclude: ['**/test/**', '**/*.test.ts', '**/index.ts'],
      cleanOnRerun: false
    },
    outputFile: 'test-results.json',
    include: ['test/**/*.test.ts']
  }
});
