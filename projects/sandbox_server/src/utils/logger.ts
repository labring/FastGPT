import { configureLoggerFromEnv, getLogger } from '@fastgpt-sdk/logger';

export const LogCategories = {
  SERVER: ['sandbox', 'server'] as const,
  HTTP: ['sandbox', 'http'] as const,
  SEALOS: ['sandbox', 'sealos'] as const
};

export async function configureLogger() {
  await configureLoggerFromEnv({
    env: process.env,
    defaultCategory: LogCategories.SERVER,
    defaultServiceName: 'fastgpt-sandbox-server',
    sensitiveProperties: ['fastgpt']
  });
}

export { getLogger };
