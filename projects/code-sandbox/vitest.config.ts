import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      include: ['src/**/*.ts'],
      cleanOnRerun: false
    },
    root: '.',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // 多个 suite 会各自启动真实 JS/Python 进程池；串行文件避免原生包冷启动和资源测试互相争抢。
    fileParallelism: false,
    isolate: false,
    env: {
      CHECK_INTERNAL_IP: 'true',
      SANDBOX_API_MAX_BODY_MB: '1',
      SANDBOX_MAX_MEMORY_MB: '256',
      // 冷启动 matplotlib 等原生包在并行测试时可能超过 8s；同时给 30s 用例超时保留回收余量。
      SANDBOX_MAX_TIMEOUT: '15000',
      SANDBOX_QUEUE_ID_CONCURRENCY: '1',
      SANDBOX_TOKEN: 'test'
    }
  }
});
