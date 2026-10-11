import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const publicNetwork = process.env.FILE_URL_INTEGRATION_PUBLIC === 'true';

/** 专项真实 HTTP 测试：不加载全局 mock、数据库初始化或开发环境凭证。 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve('../../projects/app/src'),
      '@fastgpt': resolve('..')
    }
  },
  test: {
    env: {
      // 本地夹具仅在 development 中允许回环地址；公网组使用 production 验证真实 SSRF 策略。
      NODE_ENV: publicNetwork ? 'production' : 'development',
      AIPROXY_API_ENDPOINT: 'http://127.0.0.1:1',
      AIPROXY_API_TOKEN: 'unused-file-integration-token',
      FILE_TOKEN_KEY: 'unused-file-integration-key',
      AES256_SECRET_KEY: 'unused-file-integration-key',
      INVOKE_TOKEN_SECRET: 'unused-file-integration-secret-32',
      MULTIPLE_DATA_TO_BASE64: 'false',
      // 与产品默认值一致；可显式开启严格检查，Fake-IP DNS 环境下公网夹具也可能被拒绝。
      CHECK_INTERNAL_IP: process.env.CHECK_INTERNAL_IP ?? 'false',
      FE_DOMAIN: 'https://fastgpt.example.com'
    },
    coverage: { enabled: false },
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20000,
    hookTimeout: 10000,
    include: [
      publicNetwork
        ? 'test/integrations/workflow/fileUrls.public.integration.ts'
        : 'test/integrations/workflow/fileUrls.integration.ts'
    ]
  }
});
