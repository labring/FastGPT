import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      reporter: ['text', 'json', 'html'],
      all: false
    },
    outputFile: 'test-results.json',
    setupFiles: ['./test/setup.ts'],
    include: ['./test/test.ts', './projects/app/**/*.test.ts'],
    testTimeout: 5000
  },
  resolve: {
    alias: {
      '@': resolve('projects/app/src')
    }
  }
});
