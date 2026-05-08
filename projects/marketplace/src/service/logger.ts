import { configureLoggerFromEnv, getLogger } from '@fastgpt-sdk/otel/logger';
import { marketplaceEnv } from '@/env';

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
    env: marketplaceEnv,
    defaultCategory: LogCategories.SYSTEM,
    defaultServiceName: 'fastgpt-marketplace',
    sensitiveProperties: ['fastgpt']
  });
}

export { getLogger };
