import { configureLoggerFromEnv } from '@fastgpt-sdk/otel/logger';

export const LogCategories = {
  MODULE: {
    VOLUME_MANAGER: {
      SERVER: ['volume-manager', 'server'] as const,
      API: ['volume-manager', 'api'] as const,
      DRIVER: ['volume-manager', 'driver'] as const
    }
  }
};

/** 初始化 volume-manager 日志配置，读取统一的 `LOG_*` / `OTEL_*` 环境变量。 */
export async function configureLogger() {
  await configureLoggerFromEnv({
    env: process.env,
    defaultCategory: LogCategories.MODULE.VOLUME_MANAGER.SERVER,
    defaultServiceName: 'fastgpt-volume-manager',
    sensitiveProperties: ['fastgpt']
  });
}
