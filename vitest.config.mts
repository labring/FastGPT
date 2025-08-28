import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      reporter: ['html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['projects/**/*.ts', 'packages/**/*.ts'],
      cleanOnRerun: false
    },
    outputFile: 'test-results.json',
    setupFiles: 'test/setup.ts',
    globalSetup: 'test/globalSetup.ts',
    // fileParallelism: false,
    maxConcurrency: 5,
    pool: 'threads',
    include: ['test/test.ts', 'test/cases/**/*.test.ts', 'test/evaluation/**/*.test.ts', 'projects/app/test/**/*.test.ts'],
    testTimeout: 20000,
    reporters: ['github-actions', 'default']
  },
  resolve: {
    alias: {
      '@': resolve('projects/app/src'),
      '@fastgpt': resolve('packages'),
      '@test': resolve('test')
    }
  }
});
