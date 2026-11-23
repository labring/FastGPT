import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';
import { blockPrivateDalRepoImports } from '../dal/vitestBoundary';

/**
 * L0 零数据库纯内存单元测试配置（脱离根 `test/setup.ts` 与 `MongoMemoryReplSet`）。
 *
 * 面向构造函数 DI 注入 Fake/Stub 仓储的 Service 单测与纯逻辑单测（`*.unit.test.ts`），
 * 毫秒级启动运行，兑现 Constructor DI 速度红利。
 */
export default defineConfig({
  plugins: [blockPrivateDalRepoImports()],
  resolve: {
    alias: {
      '@': resolve('../../projects/app/src'),
      '@fastgpt-sdk/storage/access-link': resolve('../../sdk/storage/src/access-link/index.ts'),
      '@fastgpt-sdk/storage': resolve('../../sdk/storage/src/index.ts'),
      '@fastgpt-sdk/otel/logger': resolve('../../sdk/otel/src/logger-entry.ts'),
      '@fastgpt-sdk/otel/metrics': resolve('../../sdk/otel/src/metrics-entry.ts'),
      '@fastgpt-sdk/otel/tracing': resolve('../../sdk/otel/src/tracing-entry.ts'),
      '@fastgpt-sdk/otel': resolve('../../sdk/otel/src/index.ts'),
      '@fastgpt': resolve('..')
    }
  },
  test: {
    env: {
      NODE_ENV: 'test'
    },
    coverage: {
      enabled: false
    },
    exclude: [...configDefaults.exclude, 'test/integrations/**/*.test.ts'],
    include: ['test/**/*.unit.test.ts'],
    passWithNoTests: true
  }
});
