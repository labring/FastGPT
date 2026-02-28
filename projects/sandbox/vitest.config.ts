import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      enabled: true,
      reporter: ['text', 'text-summary', 'html', 'json-summary', 'json'],
      reportOnFailure: true,
      all: false, // 只包含被测试实际覆盖的文件，不包含空目录
      include: ['src/**/*.ts'],
      cleanOnRerun: false
    },
    root: '.',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    maxConcurrency: 1,
    isolate: false,
    env: {
      SANDBOX_MAX_TIMEOUT: '5000',
      SANDBOX_TOKEN: 'test'
    }
  }
});
