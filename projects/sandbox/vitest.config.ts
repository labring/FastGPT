import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: '.',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
