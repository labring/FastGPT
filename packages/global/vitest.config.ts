import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    include: ['**/*.test.ts'],
    exclude: ['**/node_modules/**']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@fastgpt/global': path.resolve(__dirname, './')
    }
  }
});
