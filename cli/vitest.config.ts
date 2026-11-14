import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const cliRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@fastgpt': resolve(cliRoot, '../packages')
    }
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/types.ts', 'src/cli/cli.ts']
    }
  }
});
