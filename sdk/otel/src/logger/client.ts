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
  return getLogtapeLogger(category);
}
