import { vi } from 'vitest';

/**
 * Mock @fastgpt/service/common/logger (otel logger) with console
 */
const consoleLogger = {
  log: console.log,
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error
};

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => consoleLogger,
  configureLogger: vi.fn(),
  disposeLogger: vi.fn(),
  LogCategories: new Proxy(
    {},
    {
      get: (_target, prop) =>
        new Proxy(
          {},
          {
            get: (_t, p) =>
              new Proxy({}, { get: (_t2, p2) => `${String(prop)}.${String(p)}.${String(p2)}` })
          }
        )
    }
  )
}));
