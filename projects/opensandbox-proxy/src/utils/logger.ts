import { configureLoggerFromEnv } from '@fastgpt-sdk/otel/logger';

/**
 * `opensandbox-proxy` 结构化日志分类定义。
 * 与主站及 `volume-manager` 统一接入 `@fastgpt-sdk/otel/logger`，自动适配 `LOG_*` 与 `OTEL_*` 环境变量。
 */
export const LogCategories = {
  MODULE: {
    OPENSANDBOX_PROXY: {
      SERVER: ['opensandbox-proxy', 'server'] as const,
      TERMINAL: ['opensandbox-proxy', 'terminal'] as const,
      PREVIEW: ['opensandbox-proxy', 'preview'] as const,
      KEEPALIVE: ['opensandbox-proxy', 'keepalive'] as const
    }
  }
};

/**
 * 初始化 `opensandbox-proxy` 全局日志配置。
 * 默认服务名设为 `fastgpt-opensandbox-proxy`，并对内部共享密钥相关属性开启自动脱敏。
 */
export async function configureLogger(): Promise<void> {
  await configureLoggerFromEnv({
    env: process.env,
    defaultCategory: LogCategories.MODULE.OPENSANDBOX_PROXY.SERVER,
    defaultServiceName: 'fastgpt-opensandbox-proxy',
    sensitiveProperties: ['proxySecret', 'x-agent-sandbox-proxy-secret', 'OPEN-SANDBOX-API-KEY']
  });
}
