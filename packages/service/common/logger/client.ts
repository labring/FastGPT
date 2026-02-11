import { configure, dispose, Logger } from '@logtape/logtape';
import { env } from '../../env';
import { createSinks } from './sinks';
import { createLoggers } from './loggers';
import { getLogger as getLogtapeLogger } from '@logtape/logtape';

let configured = false;
export async function configureLogger() {
  if (configured) return;

  const {
    LOG_ENABLE_CONSOLE,
    LOG_ENABLE_OTEL,
    LOG_OTEL_SERVICE_NAME,
    LOG_OTEL_URL,
    LOG_CONSOLE_LEVEL,
    LOG_OTEL_LEVEL
  } = env;

  const { sinks, composedSinks } = await createSinks({
    enableConsole: LOG_ENABLE_CONSOLE,
    enableOtel: LOG_ENABLE_OTEL,
    otelServiceName: LOG_OTEL_SERVICE_NAME,
    otelUrl: LOG_OTEL_URL,
    consoleLevel: LOG_CONSOLE_LEVEL,
    otelLevel: LOG_OTEL_LEVEL
  });

  const loggers = createLoggers({ composedSinks });

  const contextLocalStorage = new AsyncLocalStorage<Record<string, unknown>>();

  await configure({
    contextLocalStorage,
    loggers,
    sinks
  });

  configured = true;
}

export async function disposeLogger() {
  if (!configured) return;

  await dispose();
  configured = false;
}

export function getLogger(category: readonly string[] = ['system']) {
  const logger = getLogtapeLogger(category);

  return new Proxy(logger, {
    get(target, prop, receiver) {
      const fn = Reflect.get(target, prop, receiver);
      if (typeof fn !== 'function') return fn;
      return (...args: unknown[]) => {
        if (args.length === 0) return fn.call(target);
        const [f, s] = args;
        if (args.length === 1) {
          return fn.call(target, f);
        }
        if (typeof f === 'string') {
          if (
            typeof s === 'object' &&
            s &&
            'verbose' in s &&
            typeof s.verbose === 'boolean' &&
            !s.verbose
          ) {
            delete s.verbose;
            return fn.call(target, f, s);
          }

          return fn.call(target, `${f}: {*}`, s);
        }
        if (typeof f === 'object') {
          return fn.call(target, f);
        }
        return fn.apply(target, args);
      };
    }
  });
}
