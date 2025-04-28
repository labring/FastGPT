import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: 'test/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'json-summary'],
      enabled: true,
      reportOnFailure: true,
      cleanOnRerun: false,
      include: ['runtime/**/*.ts', 'tools/**/*.ts'],
      exclude: ['**/node_modules/**', '**/dist/**']
    },
    reporters: ['github-actions', 'basic'],
    include: ['runtime/**/*.test.ts', 'tools/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**']
  }
});
