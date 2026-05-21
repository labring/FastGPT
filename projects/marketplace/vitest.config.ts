import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('src'),
      '@fastgpt-sdk/storage': resolve('../../sdk/storage/src/index.ts'),
      '@fastgpt-sdk/otel/logger': resolve('../../sdk/otel/src/logger-entry.ts'),
      '@fastgpt-sdk/otel/metrics': resolve('../../sdk/otel/src/metrics-entry.ts'),
      '@fastgpt-sdk/otel/tracing': resolve('../../sdk/otel/src/tracing-entry.ts'),
      '@fastgpt-sdk/otel': resolve('../../sdk/otel/src/index.ts'),
      '@fastgpt': resolve('../../packages'),
      '@test': resolve('../../test'),
      '#fastgpt/marketplace/test': resolve('test')
    }
  },
  test: {
    env: {
      NODE_ENV: 'test',
      FILE_TOKEN_KEY:
        process.env.FILE_TOKEN_KEY ??
        'bfd697e7e798f75deaf2d31210bc93a2e41ad4eed9e7831071d77821b7b97cff',
      AES256_SECRET_KEY: process.env.AES256_SECRET_KEY ?? 'fastgpt_test_aes256_secret_key'
    },
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: [
        'src/env.ts',
        'src/web/api.ts',
        'src/pages/api/admin/pkg/delete.ts',
        'src/pages/api/tool/getDownloadUrl.ts',
        'src/service/plugin/repo.ts',
        'src/service/s3/index.ts',
        'src/service/tool/delete.ts',
        'src/service/tool/data.ts',
        'src/service/tool/upload.ts'
      ],
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
        '**/*/*.schema.ts'
      ],
      cleanOnRerun: false
    },
    outputFile: 'test-results.json',
    fileParallelism: false,
    maxConcurrency: 10,
    pool: 'threads',
    testTimeout: 20000,
    hookTimeout: 30000,
    reporters: ['github-actions', 'default'],
    include: ['test/**/*.test.ts']
  }
});
