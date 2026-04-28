import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('../../projects/app/src'),
      '@fastgpt': resolve('..'),
      '@test': resolve('../../test')
    }
  },
  test: {
    env: {
      FILE_TOKEN_KEY:
        process.env.FILE_TOKEN_KEY ??
        'bfd697e7e798f75deaf2d31210bc93a2e41ad4eed9e7831071d77821b7b97cff'
    },
    coverage: {
      enabled: false
    },
    outputFile: 'test-results.integration.json',
    setupFiles: '../../test/setup.ts',
    globalSetup: '../../test/globalSetup.ts',
    fileParallelism: false,
    maxConcurrency: 10,
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 30000,
    reporters: ['github-actions', 'default'],
    include: ['test/integrations/**/*.integration.test.ts']
  }
});
