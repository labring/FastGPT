import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig(() => {
  return {
    test: {
      globalSetup: path.join(import.meta.dirname, 'test/global-setup.ts'),
      include: ['test/**/*.test.ts'],
      pool: 'threads',
      fileParallelism: false,
      testTimeout: 120_000,
      hookTimeout: 120_000,
      reporters: ['default']
    }
  };
});
