import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // This configuration runs the sandbox tests in isolation,
    // without the global setup (e.g., MongoDB connection) from the root config.
    dir: 'tests',
    testTimeout: 30000,
  },
});