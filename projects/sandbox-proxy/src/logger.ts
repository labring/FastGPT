import { configureLoggerFromEnv, getLogger } from '@fastgpt-sdk/otel/logger';
import { env } from './env';

export const LogCategories = {
  MODULE: {
    SANDBOX_PROXY: {
      SERVER: ['sandbox-proxy', 'server'] as const
    }
  }
};

export async function configureLogger(options: { serviceName?: string } = {}) {
  await configureLoggerFromEnv({
    env: process.env,
    defaultCategory: LogCategories.MODULE.SANDBOX_PROXY.SERVER,
    defaultServiceName: options.serviceName || 'fastgpt-sandbox-proxy',
    defaultConsoleLevel: env.logLevel,
    sensitiveProperties: ['fastgpt', 'authorization', 'cookie']
  });
}

export { getLogger };
