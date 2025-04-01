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
    fileParallelism: false,
    pool: 'threads',
    include: ['test/test.ts', 'test/cases/**/*.test.ts', 'projects/app/test/**/*.test.ts'],
    testTimeout: 5000,
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
