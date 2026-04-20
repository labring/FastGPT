import { configureLoggerFromEnv, disposeLogger, getLogger } from '@fastgpt-sdk/otel/logger';

export async function configureLogger() {
  const { env } = await import('../../env');

  await configureLoggerFromEnv({
    env,
    defaultCategory: ['system'],
    defaultServiceName: 'fastgpt-client',
    sensitiveProperties: ['fastgpt']
  });
}

export { disposeLogger, getLogger };
