import { startSystemConfigPolling } from '@fastgpt/service/common/system/systemInstanceConfig/polling';
import { initSystemConfig } from '.';

/** 启动 App 常驻配置检查；只在版本变化后重建并发布完整运行时配置。 */
export const startAppConfigPolling = () =>
  startSystemConfigPolling({
    key: 'app',
    refresh: async () => {
      await initSystemConfig();
    }
  });
