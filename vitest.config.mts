import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      reporter: ['html', 'json-summary', 'json'],
      all: false,
      reportOnFailure: true
    },
    outputFile: 'test-results.json',
    setupFiles: ['./test/setup.ts'],
    include: ['./test/test.ts', './projects/app/**/*.test.ts'],
    testTimeout: 5000
  },
  resolve: {
    alias: {
      '@': resolve('projects/app/src'),
      '@fastgpt': resolve('packages'),
      '@test': resolve('test')
    }
  }
});
