import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.ts'],
    hookTimeout: 120000,
    coverage: {
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.schema.ts', 'src/sdk/**/*']
    }
  },
  resolve: {
    alias: {
      '@': './src'
    }
  }
});
