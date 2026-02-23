import { resolve } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('projects/app/src'),
      '@fastgpt': resolve('packages'),
      '@test': resolve('test')
    }
  },
  test: {
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportsDirectory: './coverage',
      reportOnFailure: true,
      all: false, // 只包含被测试实际覆盖的文件，不包含空目录
      include: ['projects/**/*.ts', 'packages/**/*.ts'],
      exclude: [
        '**/node_modules/**',
        '**/*.spec.ts',
        '**/*/*.d.ts',
        '**/test/**',
        '**/*.test.ts',
        '**/*/constants.ts',
        '**/*/*.const.ts',
        '**/*/type.ts',
        '**/*/types.ts',
        '**/*/type/*',
        '**/*/schema.ts',
        '**/*/*.schema.ts',
        'packages/global/openapi/**/*',
        'packages/global/core/workflow/template/**/*'
      ],
      cleanOnRerun: false
    },
    outputFile: 'test-results.json',
    setupFiles: 'test/setup.ts',
    globalSetup: 'test/globalSetup.ts',
    // File-level execution: serial (one file at a time to avoid MongoDB conflicts)
    fileParallelism: false,
    // Test-level execution within a file: parallel (up to 5 concurrent tests)
    maxConcurrency: 10,
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 30000,
    reporters: ['github-actions', 'default'],
    include: [
      'test/**/*.test.ts',
      'projects/app/test/**/*.test.ts',
      'projects/sandbox/test/**/*.test.ts',
      'projects/marketplace/test/**/*.test.ts'
    ]
  }
});
