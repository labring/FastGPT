import { configureLoggerFromEnv, getLogger } from '@fastgpt-sdk/logger';

export const LogCategories = {
  SYSTEM: ['system'] as const,
  INFRA: {
    MONGO: ['infra', 'mongo'] as const
  },
  MODULE: {
    API: ['marketplace', 'api'] as const,
    DOWNLOAD: ['marketplace', 'download'] as const
  }
};

export async function configureLogger() {
  await configureLoggerFromEnv({
    env: process.env,
    defaultCategory: LogCategories.SYSTEM,
    defaultServiceName: 'fastgpt-marketplace',
    sensitiveProperties: ['fastgpt']
  });
}

export { getLogger };
