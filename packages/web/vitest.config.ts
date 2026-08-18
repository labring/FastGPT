import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@fastgpt': resolve('..')
    }
  },
  test: {
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['i18n/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/*.d.ts',
        '**/test/**',
        '**/*.test.ts',
        '**/constants.ts',
        '**/type.ts',
        '**/types.ts'
      ],
      cleanOnRerun: false
    },
    outputFile: 'test-results.json',
    include: ['test/**/*.test.ts']
  }
});
