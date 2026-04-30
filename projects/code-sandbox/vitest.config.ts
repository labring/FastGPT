import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['src/**/*.ts'],
      cleanOnRerun: false
    },
    root: '.',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    maxConcurrency: 1,
    isolate: false,
    env: {
      CHECK_INTERNAL_IP: 'true',
      SANDBOX_MAX_TIMEOUT: '5000',
      SANDBOX_TOKEN: 'test'
    }
  }
});
