import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';
import { defineConfig } from 'vitest/config';
import base from './vitest.config';

const root = resolve(import.meta.dirname, '../..');
const envFile = process.env.FASTGPT_RESOURCE_ENV_FILE;
if (!envFile) throw new Error('FASTGPT_RESOURCE_ENV_FILE must point to the local development env');
const localEnv = parseEnv(readFileSync(envFile, 'utf8'));
if (!localEnv.REDIS_URL) throw new Error('Local env must configure REDIS_URL');
const redis = new URL(localEnv.REDIS_URL);
redis.pathname = '/14';

/** 独立 HTTP 集成配置：不加载通用单测的鉴权、Mongo、Redis 或 API wrapper mock。 */
export default defineConfig({
  ...base,
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: '',
        customResolver(id, importer) {
          const source = importer?.includes('/pro/admin/') ? 'pro/admin/src' : 'projects/app/src';
          return this.resolve(resolve(root, source, id), importer, { skipSelf: true });
        }
      },
      ...Object.entries(base.resolve!.alias as Record<string, string>)
        .filter(([name]) => name !== '@')
        .map(([find, replacement]) => ({ find, replacement }))
    ]
  },
  test: {
    ...base.test,
    env: {
      ...localEnv,
      NODE_ENV: 'test',
      // Mongo 由 globalSetup 启动本地真实副本集；禁止意外连接开发数据库。
      MONGODB_URI: 'mongodb://127.0.0.1:1/resource_integration_unconfigured',
      MONGODB_LOG_URI: 'mongodb://127.0.0.1:1/resource_integration_unconfigured',
      REDIS_URL: redis.toString(),
      PRO_URL: 'http://127.0.0.1:3311',
      FE_DOMAIN: 'http://127.0.0.1:3310',
      MAX_FOLDER_DEPTH: '4',
      LOG_LEVEL: 'error'
    },
    setupFiles: [],
    globalSetup: resolve(root, 'test/globalSetup.ts'),
    include: ['test/integration/resourceHierarchy.local.integration.test.ts'],
    coverage: { enabled: false },
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 90000,
    hookTimeout: 90000,
    reporters: ['default', 'json'],
    outputFile: { json: '/tmp/fastgpt-pr8155-local-http-results.json' }
  }
});
