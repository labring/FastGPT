import { configureLoggerFromEnv, getLogger } from '@fastgpt-sdk/logger';

export const LogCategories = {
  MODULE: {
    SANDBOX: {
      SERVER: ['sandbox', 'server'] as const,
      API: ['sandbox', 'api'] as const
    }
  }
};

export async function configureLogger(options: { serviceName?: string } = {}) {
  await configureLoggerFromEnv({
    env: process.env,
    defaultCategory: LogCategories.MODULE.SANDBOX.SERVER,
    defaultServiceName: options.serviceName || 'fastgpt-code-sandbox',
    sensitiveProperties: ['fastgpt']
  });
}

export { getLogger };
