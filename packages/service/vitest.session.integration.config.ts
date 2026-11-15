import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

/** 会话专项集成测试不加载通用 mock，直接验证真实 Redis / Mongo 及 HTTP 管线。 */
export default defineConfig({
  resolve: {
    alias: {
      ioredis: resolve('../dal/node_modules/ioredis'),
      '@': resolve('../../projects/app/src'),
      '@fastgpt-sdk/otel/logger': resolve('../../sdk/otel/src/logger-entry.ts'),
      '@fastgpt': resolve('..')
    }
  },
  test: {
    env: {
      NODE_ENV: 'test',
      AIPROXY_API_ENDPOINT: 'http://127.0.0.1:3000',
      AIPROXY_API_TOKEN: 'session-integration-only',
      FILE_TOKEN_KEY: 'session-integration-only-file-key',
      AES256_SECRET_KEY: 'session-integration-only-encryption-key',
      INVOKE_TOKEN_SECRET: 'session-integration-only-invoke-secret-32',
      FE_DOMAIN: 'http://127.0.0.1',
      MONGODB_URI: process.env.SESSION_TEST_MONGODB_URI ?? '',
      REDIS_URL: process.env.REDIS_INTEGRATION_URL ?? ''
    },
    setupFiles: ['test/integrations/user/session.setup.ts'],
    coverage: { enabled: false },
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    include: ['test/integrations/user/session*.integration.test.ts']
  }
});
