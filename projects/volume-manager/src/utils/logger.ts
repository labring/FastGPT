import { configureLoggerFromEnv, disposeLogger, getLogger } from '@fastgpt-sdk/otel/logger';

export const LogCategories = {
  MODULE: {
    VOLUME_MANAGER: {
      SERVER: ['volume-manager', 'server'] as const,
      API: ['volume-manager', 'api'] as const,
      DRIVER: ['volume-manager', 'driver'] as const
    }
  }
};

/** 初始化 Volume Manager 全局 `@fastgpt-sdk/otel` 日志器。 */
export async function configureLogger(options: { serviceName?: string } = {}) {
  await configureLoggerFromEnv({
    env: process.env,
    defaultCategory: LogCategories.MODULE.VOLUME_MANAGER.SERVER,
    defaultServiceName: options.serviceName || 'fastgpt-volume-manager',
    defaultConsoleLevel: 'info'
  });
}

export { disposeLogger, getLogger };
