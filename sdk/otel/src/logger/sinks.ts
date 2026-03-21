import type { LogLevel, LogRecord } from '@logtape/logtape';
import { getConsoleSink, withFilter } from '@logtape/logtape';
import { getPrettyFormatter } from '@logtape/pretty';
import { mapLevelToSeverityNumber } from './helpers';
import { getOpenTelemetrySink } from './otel';
import type {
  ConsoleLoggerOptions,
  LogTapeConfig,
  LoggerConfigureOptions,
  LoggerSinkId,
  OtelLoggerOptions
} from './types';

type SinkConfig = LogTapeConfig<string>['sinks'];

type CreateSinksOptions = Pick<LoggerConfigureOptions, 'console' | 'otel' | 'sensitiveProperties'>;

type CreateSinksResult = {
  sinks: SinkConfig;
  composedSinks: LoggerSinkId[];
};

const defaultConsoleOptions: Required<ConsoleLoggerOptions> = {
  enabled: true,
  level: 'trace'
};

const defaultOtelOptions = {
  enabled: false,
  level: 'info' as LogLevel
};

function normalizeConsoleOptions(
  options?: boolean | ConsoleLoggerOptions
): Required<ConsoleLoggerOptions> {
  if (typeof options === 'boolean') {
    return {
      ...defaultConsoleOptions,
      enabled: options
    };
  }

  return {
    enabled: options?.enabled ?? defaultConsoleOptions.enabled,
    level: options?.level ?? defaultConsoleOptions.level
  };
}

function normalizeOtelOptions(options?: false | OtelLoggerOptions) {
  if (!options) {
    return {
      ...defaultOtelOptions,
      serviceName: undefined,
      url: undefined,
      loggerName: undefined
    };
  }

  return {
    enabled: options.enabled ?? true,
    level: options.level ?? defaultOtelOptions.level,
    serviceName: options.serviceName,
    url: options.url,
    loggerName: options.loggerName ?? options.serviceName
  };
}

function pad(value: number) {
  return value.toString().padStart(2, '0');
}

function formatTimestamp(timestamp: number | Date) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export async function createSinks(options: CreateSinksOptions): Promise<CreateSinksResult> {
  const consoleOptions = normalizeConsoleOptions(options.console);
  const otelOptions = normalizeOtelOptions(options.otel);
  const sensitiveProperties = options.sensitiveProperties ?? [];

  const sinkConfig = {
    bufferSize: 8192,
    flushInterval: 5000,
    nonBlocking: true,
    lazy: true
  } as const;

  const sinks: SinkConfig = {};
  const composedSinks: LoggerSinkId[] = [];

  const levelFilter = (record: LogRecord, level: LogLevel) => {
    return mapLevelToSeverityNumber(record.level) >= mapLevelToSeverityNumber(level);
  };

  if (consoleOptions.enabled) {
    sinks.console = withFilter(
      getConsoleSink({
        ...sinkConfig,
        formatter: getPrettyFormatter({
          icons: false,
          level: 'ABBR',
          wordWrap: false,
          messageColor: null,
          categoryColor: null,
          timestampColor: null,
          levelStyle: 'reset',
          messageStyle: 'reset',
          categoryStyle: 'reset',
          timestampStyle: 'reset',
          categorySeparator: ':',
          timestamp: formatTimestamp,
          inspectOptions: { depth: 5 }
        })
      }),
      (record) => levelFilter(record, consoleOptions.level)
    );
    composedSinks.push('console');
  }

  if (otelOptions.enabled) {
    if (!otelOptions.serviceName) {
      throw new Error('`otel.serviceName` is required when OpenTelemetry logging is enabled');
    }

    sinks.otel = withFilter(
      getOpenTelemetrySink({
        serviceName: otelOptions.serviceName,
        loggerName: otelOptions.loggerName,
        otlpExporterConfig: otelOptions.url ? { url: otelOptions.url } : undefined
      }),
      (record) => {
        const properties = record.properties ?? {};

        return (
          levelFilter(record, otelOptions.level) &&
          !sensitiveProperties.some((property) => property in properties)
        );
      }
    );

    composedSinks.push('otel');
  }

  return { sinks, composedSinks };
}
