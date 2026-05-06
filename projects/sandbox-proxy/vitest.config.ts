import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: false,
      reporter: ['text', 'text-summary'],
      include: ['src/**/*.ts']
    },
    root: '.',
    include: ['test/**/*.test.ts'],
    testTimeout: 10000,
    env: {
      SANDBOX_PROXY_BASE: 'localhost:3006,proxy.example.com',
      SANDBOX_PROXY_SECRET: 'a'.repeat(32),
      SANDBOX_PROXY_APP_BASE_URL: 'http://localhost:3000'
    }
  }
});
