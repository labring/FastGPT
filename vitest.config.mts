import { resolve } from 'path';
import { defineConfig } from 'vitest/config';
import { getTestMaxWorkers } from './test/vitestWorkers';

export default defineConfig({
  resolve: {
    alias: {
      // 跨包集成测试会加载 pro/admin 的同步模块，该模块内部用 '@/' 指代 pro/admin/src；
      // 这条 specifier 在 projects/app 下不存在（根仓其它用例不引用），单独指向 pro/admin
      '@/service/common/crawler': resolve('pro/admin/src/service/common/crawler'),
      '@': resolve('projects/app/src'),
      '@fastgpt-sdk/storage/access-link': resolve('sdk/storage/src/access-link/index.ts'),
      '@fastgpt-sdk/storage': resolve('sdk/storage/src/index.ts'),
      '@fastgpt-sdk/otel/logger': resolve('sdk/otel/src/logger-entry.ts'),
      '@fastgpt-sdk/otel/metrics': resolve('sdk/otel/src/metrics-entry.ts'),
      '@fastgpt-sdk/otel/tracing': resolve('sdk/otel/src/tracing-entry.ts'),
      '@fastgpt-sdk/otel': resolve('sdk/otel/src/index.ts'),
      '@fastgpt': resolve('packages'),
      '@test': resolve('test')
    }
  },
  test: {
    env: {
      AIPROXY_API_ENDPOINT: process.env.AIPROXY_API_ENDPOINT ?? 'http://127.0.0.1:3000',
      AIPROXY_API_TOKEN: process.env.AIPROXY_API_TOKEN ?? 'test-aiproxy-token',
      FILE_TOKEN_KEY:
        process.env.FILE_TOKEN_KEY ??
        'bfd697e7e798f75deaf2d31210bc93a2e41ad4eed9e7831071d77821b7b97cff',
      AES256_SECRET_KEY: process.env.AES256_SECRET_KEY ?? 'fastgpt_test_aes256_secret_key',
      INVOKE_TOKEN_SECRET: process.env.INVOKE_TOKEN_SECRET ?? 'fastgpt_test_invoke_token_secret_32',
      FE_DOMAIN: process.env.FE_DOMAIN ?? 'https://fastgpt.example.com'
    },
    coverage: {
      enabled: true,
      reporter: ['html', 'json-summary', 'json'],
      // reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['projects/app/**/*.ts', 'packages/**/*.ts'],
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
    fileParallelism: true,
    maxWorkers: getTestMaxWorkers(),
    // Test-level execution within a file: parallel (up to 5 concurrent tests)
    maxConcurrency: 10,
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 30000,
    passWithNoTests: true,
    reporters: ['github-actions', 'default'],
    include: ['test/**/*.test.ts']
  }
});
