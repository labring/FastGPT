import { configureLoggerFromEnv, disposeLogger, getLogger } from '@fastgpt-sdk/otel/logger';

export async function configureLogger() {
  const { serviceEnv } = await import('../../env');

  await configureLoggerFromEnv({
    env: serviceEnv,
    defaultCategory: ['system'],
    defaultServiceName: 'fastgpt-client',
    sensitiveProperties: ['fastgpt']
  });
}

export { disposeLogger, getLogger };
