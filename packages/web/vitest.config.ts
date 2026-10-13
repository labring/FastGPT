import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import { getTestMaxWorkers } from '../../test/vitestWorkers';

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
    fileParallelism: true,
    maxWorkers: getTestMaxWorkers(),
    include: ['test/**/*.test.ts']
  }
});
