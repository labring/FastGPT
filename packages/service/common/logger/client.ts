import { configure, dispose } from '@logtape/logtape';
import { env } from '../../env';
import { createSinks } from './sinks';
import { createLoggers } from './loggers';

let configured = false;
export async function configureLogger() {
  if (configured) return;

  const {
    LOG_ENABLE_CONSOLE,
    LOG_ENABLE_DEBUG_LEVEL,
    LOG_ENABLE_OTEL,
    LOG_OTEL_SERVICE_NAME,
    LOG_OTEL_URL
  } = env;

  const { sinks, composedSinks } = await createSinks({
    enableConsole: LOG_ENABLE_CONSOLE,
    enableOtel: LOG_ENABLE_OTEL,
    otelServiceName: LOG_OTEL_SERVICE_NAME,
    otelUrl: LOG_OTEL_URL
  });

  const loggers = createLoggers({
    composedSinks,
    enableDebugLevel: LOG_ENABLE_DEBUG_LEVEL
  });

  const contextLocalStorage = new AsyncLocalStorage<Record<string, unknown>>();

  await configure({ sinks, loggers, contextLocalStorage });

  configured = true;
}

export async function desposeLogger() {
  if (!configured) return;

  await dispose();
  configured = false;
}
