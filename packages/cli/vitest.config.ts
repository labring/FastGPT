import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@fastgpt-sdk/client/error': resolve('../../sdk/client/src/error.ts'),
      '@fastgpt-sdk/client/dataset/operations': resolve(
        '../../sdk/client/src/dataset/operations.ts'
      ),
      '@fastgpt-sdk/client/dataset/schema': resolve('../../sdk/client/src/dataset/schema.ts'),
      '@fastgpt-sdk/client': resolve('../../sdk/client/src/client.ts')
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    fileParallelism: false,
    coverage: {
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli.ts']
    }
  }
});
