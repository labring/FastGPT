import { configureLoggerFromEnv, disposeLogger, getLogger } from '@fastgpt-sdk/otel/logger';
import { env } from '../../env';

export async function configureLogger() {
  await configureLoggerFromEnv({
    env,
    defaultCategory: ['system'],
    defaultServiceName: 'fastgpt-client',
    sensitiveProperties: ['fastgpt']
  });
}

export { disposeLogger, getLogger };
