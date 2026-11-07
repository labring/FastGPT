import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@fastgpt/workflow-core/test': resolve('../workflow-core/test'),
      '@fastgpt/workflow-core': resolve('../workflow-core/src'),
      '@fastgpt': resolve('..')
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/type.ts', 'src/cli.ts', 'src/index.ts']
    }
  }
});
