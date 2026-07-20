import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    pool: 'threads',
    reporters: ['default'],
    coverage: {
      thresholds: {
        statements: 90,
        branches: 75,
        functions: 90,
        lines: 90
      }
    }
  }
});
