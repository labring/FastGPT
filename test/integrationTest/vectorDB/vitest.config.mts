import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '../../../projects/app/src'),
      '@fastgpt': resolve(__dirname, '../../../packages'),
      '@test': resolve(__dirname, '../..')
    }
  },
  test: {
    name: 'vectorDB',
    root: resolve(__dirname),
    setupFiles: './setup.ts',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 60000,
    hookTimeout: 60000,
    fileParallelism: false,
    reporters: ['verbose']
  }
});
