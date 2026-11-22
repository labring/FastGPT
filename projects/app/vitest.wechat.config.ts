import { defineConfig } from 'vitest/config';
import appConfig from './vitest.config';

/** iLink Mock 回归独立运行，数据源和工作流由测试替身提供。 */
export default defineConfig({
  ...appConfig,
  test: {
    ...appConfig.test,
    include: ['test/api/support/outLink/wechat/mockFlow.test.ts'],
    globalSetup: [],
    setupFiles: [],
    coverage: { enabled: false },
    reporters: ['default']
  }
});
