import { AsyncLocalStorage } from 'node:async_hooks';
import { configure, dispose, getLogger as getLogtapeLogger } from '@logtape/logtape';
import { createLoggers } from './loggers';
import { createSinks } from './sinks';
import type { LogCategory, LoggerConfigureOptions, LoggerContext } from './types';

let configured = false;
let configurePromise: Promise<void> | null = null;
let defaultCategory: LogCategory = ['system'];

export async function configureLogger(options: LoggerConfigureOptions = {}) {
  if (configured) return;
  if (configurePromise) return configurePromise;

  configurePromise = (async () => {
    defaultCategory = options.defaultCategory ?? defaultCategory;

    const { sinks, composedSinks } = await createSinks({
      console: options.console,
      otel: options.otel,
      sensitiveProperties: options.sensitiveProperties
    });

    const loggers = options.loggers ?? createLoggers({ composedSinks });
    const contextLocalStorage =
      options.contextLocalStorage ?? new AsyncLocalStorage<LoggerContext>();

    await configure({
      contextLocalStorage,
      loggers,
      sinks
    });

    configured = true;
  })();

  try {
    await configurePromise;
  } catch (error) {
    configurePromise = null;
    throw error;
  }
}

export async function disposeLogger() {
  if (configurePromise) {
    try {
      await configurePromise;
    } catch {
      configurePromise = null;
      return;
    }
  }

  if (!configured) return;

  await dispose();

  configured = false;
  configurePromise = null;
}

export function getLogger(category: LogCategory = defaultCategory) {
  const logger = getLogtapeLogger(category);

  return new Proxy(logger, {
    get(target, prop, receiver) {
      const fn = Reflect.get(target, prop, receiver);

      if (typeof fn !== 'function') return fn;

      return (...args: unknown[]) => {
        if (args.length === 0) return fn.call(target);

        const [firstArg, secondArg] = args;

        if (args.length === 1) {
          return fn.call(target, firstArg);
        }

        if (typeof firstArg === 'string') {
          if (
            typeof secondArg === 'object' &&
            secondArg &&
            'verbose' in secondArg &&
            typeof secondArg.verbose === 'boolean' &&
            !secondArg.verbose
          ) {
            const { verbose: _verbose, ...properties } = secondArg as Record<string, unknown> & {
              verbose?: boolean;
            };

            return fn.call(target, firstArg, properties);
          }

          return fn.call(target, `${firstArg}: {*}`, secondArg);
        }

        if (typeof firstArg === 'object') {
          return fn.call(target, firstArg);
        }

        return fn.apply(target, args);
      };
    }
  });
}
