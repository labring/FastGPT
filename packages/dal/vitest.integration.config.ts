import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@fastgpt': resolve('..')
    }
  },
  test: {
    globalSetup: resolve(import.meta.dirname, 'test/integrations/mongodb/global-setup.ts'),
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
    outputFile: 'test-results.integration.mongodb.json',
    include: ['test/integrations/mongodb/**/*.integration.test.ts']
  }
});
