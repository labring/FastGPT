import { systemInstanceConfig } from '@fastgpt/service/common/system/systemInstanceConfig/service';
import { initSystemConfig } from '.';

/** 启动 App 常驻配置检查；只在版本变化后重建并发布完整运行时配置。 */
export const startAppConfigPolling = () =>
  systemInstanceConfig.startPolling({
    key: 'app',
    refresh: async ({ changedScopes, initialLoad }) => {
      await initSystemConfig({
        refreshLLMRequestRecordTTL: initialLoad || changedScopes.includes('performance')
      });
    }
  });
