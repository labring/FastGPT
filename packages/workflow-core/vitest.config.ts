import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@fastgpt': resolve('..')
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/type.ts', 'src/**/schema.ts', 'src/index.ts']
    }
  }
});
