import { resolve } from 'path';
import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

// 加载 .env.local，让 globalSetup 也能获取本地环境变量（如 MONGOMS_SYSTEM_BINARY）
loadDotenv({ path: resolve('.env.local'), override: false });

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('projects/app/src'),
      '@fastgpt': resolve('packages'),
      '@test': resolve('test'),
      'diting-rag-ts': resolve('packages/diting-rag-ts/src')
    }
  },
  test: {
    coverage: {
      enabled: true,
      reporter: ['html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['projects/**/*.ts', 'packages/**/*.ts'],
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
    include: [
      'test/test.ts',
      'test/cases/**/*.test.ts',
      'projects/app/test/**/*.test.ts',
      'projects/sandbox/test/**/*.test.ts',
      'projects/marketplace/test/**/*.test.ts'
    ],
    exclude: ['test/vectorDB/**'],
    testTimeout: 20000,
    hookTimeout: 30000,
    reporters: ['github-actions', 'default']
  }
});
