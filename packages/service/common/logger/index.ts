import { AsyncLocalStorage } from 'node:async_hooks';
import type { Config } from '@logtape/logtape';
import {
  configure,
  dispose,
  getConsoleSink,
  getLogger as getLogTapeLogger
} from '@logtape/logtape';
import { getOpenTelemetrySink } from '@logtape/otel';
import { getPrettyFormatter } from '@logtape/pretty';
import dayjs from 'dayjs';
import type { LogCategory } from './categories';

type SinkId = 'console' | 'jsonl' | 'otel';

type FilterId = string;

type LogTapeConfig<S extends string = SinkId, F extends string = FilterId> = Config<S, F>;

type SinkConfig = LogTapeConfig<string>['sinks'];

type LoggerConfig = LogTapeConfig['loggers'];

let configured = false;

export async function configureLogger() {
  if (configured) {
    return;
  }

  const isDevelopmentNodeEnv = process.env.NODE_ENV === 'development';
  const enableConsole = process.env.LOG_ENABLE_CONSOLE === 'true';
  const enableOtel = process.env.LOG_ENABLE_OTEL === 'true';
  const otelServiceName = process.env.LOG_OTEL_SERVICE_NAME || 'fastgpt-client';
  const otelUrl = process.env.LOG_OTEL_URL || 'http://localhost:4318/v1/logs';

  const sinkConfig = {
    bufferSize: 8192,
    flushInterval: 5000,
    nonBlocking: true,
    lazy: true
  } as const;

  const sinks: SinkConfig = {};
  const composedSinks: SinkId[] = [];

  if (enableConsole) {
    sinks.console = getConsoleSink({
      ...sinkConfig,
      formatter: getPrettyFormatter({
        icons: false,
        level: 'ABBR',
        levelStyle: 'reset',
        messageStyle: 'reset',
        categoryStyle: 'reset',
        categorySeparator: ':',
        timestamp: () => dayjs().format('YYYY-MM-DD HH:mm:ss')
      })
    });
    composedSinks.push('console');
    console.log('✓ Logtape console sink enabled');
  }

  if (enableOtel) {
    sinks.otel = getOpenTelemetrySink({
      serviceName: otelServiceName,
      otlpExporterConfig: {
        url: otelUrl
      }
    });
    composedSinks.push('otel');
    console.log(`✓ Logtape OpenTelemetry URL: ${otelUrl}`);
    console.log(`✓ Logtape OpenTelemetry service name: ${otelServiceName}`);
    console.log('✓ Logtape OpenTelemetry enabled');
  }

  const loggers: LoggerConfig = [
    {
      category: ['logtape', 'meta'],
      lowestLevel: 'error',
      sinks: []
    },
    {
      category: ['app'],
      lowestLevel: isDevelopmentNodeEnv ? 'debug' : 'info',
      sinks: composedSinks
    },
    {
      category: ['error'],
      lowestLevel: isDevelopmentNodeEnv ? 'debug' : 'error',
      sinks: composedSinks
    },
    {
      category: ['http'],
      lowestLevel: isDevelopmentNodeEnv ? 'debug' : 'info',
      sinks: composedSinks
    },
    {
      category: ['middleware'],
      lowestLevel: isDevelopmentNodeEnv ? 'debug' : 'info',
      sinks: composedSinks
    },
    {
      category: ['infra'],
      lowestLevel: isDevelopmentNodeEnv ? 'debug' : 'info',
      sinks: composedSinks
    },
    {
      category: ['mod'],
      lowestLevel: isDevelopmentNodeEnv ? 'debug' : 'info',
      sinks: composedSinks
    }
  ];

  console.log('✓ Logtape has enabled sinks:', composedSinks);

  await configure({
    sinks: sinks,
    loggers: loggers,
    contextLocalStorage: new AsyncLocalStorage()
  });

  configured = true;
}

export function getLogger(category: LogCategory) {
  return getLogTapeLogger(category);
}

export async function destroyLogger() {
  if (configured) {
    await dispose();
    configured = false;
  }
}

export { type Logger, withContext } from '@logtape/logtape';
export type { LogCategory } from './categories';
export { root, http, middleware, mod, infra } from './categories';
