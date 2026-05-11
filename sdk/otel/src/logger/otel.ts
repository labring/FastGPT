import { getLogger, type Logger, type LogRecord, type Sink } from '@logtape/logtape';
import { context, diag, type DiagLogger, DiagLogLevel } from '@opentelemetry/api';
import {
  type AnyValue,
  type Logger as OTLogger,
  type LoggerProvider as LoggerProviderBase,
  type LogRecord as OTLogRecord,
  NOOP_LOGGER
} from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import type { Resource } from '@opentelemetry/resources';
import { defaultResource, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { inspect as nodeInspect } from 'util';
import { mapLevelToSeverityNumber } from './helpers';

function getEnvironmentVariable(name: string): string | undefined {
  return process.env[name];
}

type OtlpHttpExporterConfig = ConstructorParameters<typeof OTLPLogExporter>[0];

function hasOtlpEndpoint(config?: OtlpHttpExporterConfig): boolean {
  if (config?.url) return true;

  const logsEndpoint = getEnvironmentVariable('OTEL_EXPORTER_OTLP_LOGS_ENDPOINT');
  if (logsEndpoint) return true;

  const endpoint = getEnvironmentVariable('OTEL_EXPORTER_OTLP_ENDPOINT');
  if (endpoint) return true;

  return false;
}

type ILoggerProvider = LoggerProviderBase & {
  shutdown?: () => Promise<void>;
};

interface OpenTelemetrySinkOptionsBase {
  diagnostics?: boolean;
  loggerName?: string;
}

export interface OpenTelemetrySinkProviderOptions extends OpenTelemetrySinkOptionsBase {
  loggerProvider: ILoggerProvider;
}

export interface OpenTelemetrySinkExporterOptions extends OpenTelemetrySinkOptionsBase {
  loggerProvider?: undefined;
  otlpExporterConfig?: OtlpHttpExporterConfig;
  serviceName?: string;
  additionalResource?: Resource;
}

export type OpenTelemetrySinkOptions =
  | OpenTelemetrySinkProviderOptions
  | OpenTelemetrySinkExporterOptions;

const noopLoggerProvider: ILoggerProvider = {
  getLogger: () => NOOP_LOGGER
};

async function initializeLoggerProvider(
  options: OpenTelemetrySinkExporterOptions
): Promise<ILoggerProvider> {
  if (!hasOtlpEndpoint(options.otlpExporterConfig)) {
    return noopLoggerProvider;
  }

  const resource = defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: options.serviceName ?? getEnvironmentVariable('OTEL_SERVICE_NAME')
    }).merge(options.additionalResource ?? null)
  );

  const otlpExporter = new OTLPLogExporter(options.otlpExporterConfig);
  const loggerProvider = new LoggerProvider({
    resource,
    processors: [new BatchLogRecordProcessor(otlpExporter)]
  });

  return loggerProvider;
}

function emitLogRecord(logger: OTLogger, record: LogRecord): void {
  const { category, level, timestamp } = record;
  const severityNumber = mapLevelToSeverityNumber(level);

  logger.emit({
    severityNumber,
    severityText: level,
    body: convertRecordToStructuredBody(record),
    attributes: {
      category: [...category]
    },
    context: context.active(),
    timestamp: new Date(timestamp)
  } satisfies OTLogRecord);
}

export interface OpenTelemetrySink extends Sink, AsyncDisposable {
  readonly ready: Promise<void>;
}

function getOpenTelemetryLoggerName(options: OpenTelemetrySinkOptions): string {
  const serviceName = 'serviceName' in options ? options.serviceName : undefined;

  return options.loggerName ?? serviceName ?? 'app';
}

export function getOpenTelemetrySink(options: OpenTelemetrySinkOptions = {}): OpenTelemetrySink {
  if (options.diagnostics) {
    diag.setLogger(new DiagLoggerAdaptor(), DiagLogLevel.DEBUG);
  }

  if (options.loggerProvider != null) {
    const loggerProvider = options.loggerProvider;
    const logger = loggerProvider.getLogger(getOpenTelemetryLoggerName(options));
    const shutdown = loggerProvider.shutdown?.bind(loggerProvider);
    const sink: OpenTelemetrySink = Object.assign(
      (record: LogRecord) => {
        const { category } = record;
        if (category[0] === 'logtape' && category[1] === 'meta' && category[2] === 'otel') {
          return;
        }
        emitLogRecord(logger, record);
      },
      {
        ready: Promise.resolve(),
        async [Symbol.asyncDispose](): Promise<void> {
          if (shutdown != null) await shutdown();
        }
      }
    );
    return sink;
  }

  let loggerProvider: ILoggerProvider | null = null;
  let logger: OTLogger | null = null;
  let initPromise: Promise<void> | null = null;
  let initError: Error | null = null;
  let pendingRecords: LogRecord[] = [];

  const sink: OpenTelemetrySink = Object.assign(
    (record: LogRecord) => {
      const { category } = record;
      if (category[0] === 'logtape' && category[1] === 'meta' && category[2] === 'otel') {
        return;
      }

      if (logger != null) {
        emitLogRecord(logger, record);
        return;
      }

      if (initError != null) {
        return;
      }

      pendingRecords.push(record);

      if (initPromise == null) {
        initPromise = initializeLoggerProvider(options)
          .then((provider) => {
            loggerProvider = provider;
            logger = provider.getLogger(getOpenTelemetryLoggerName(options));
            for (const pendingRecord of pendingRecords) {
              emitLogRecord(logger, pendingRecord);
            }
            pendingRecords = [];
          })
          .catch((error) => {
            initError = error as Error;
            pendingRecords = [];
            console.error('Failed to initialize OpenTelemetry logger:', error);
          });
      }
    },
    {
      get ready(): Promise<void> {
        return initPromise ?? Promise.resolve();
      },
      async [Symbol.asyncDispose](): Promise<void> {
        if (initPromise != null) {
          try {
            await initPromise;
          } catch {
            return;
          }
        }
        if (loggerProvider?.shutdown != null) {
          await loggerProvider.shutdown();
        }
      }
    }
  );

  return sink;
}

type SafeNormalizeOptions = {
  seen?: WeakSet<object>;
  depth?: number;
  maxDepth?: number;
  maxKeys?: number;
  bytesAsSummary?: boolean;
};

const defaultMaxNormalizeDepth = 8;
const defaultMaxObjectKeys = 128;
const reservedStructuredBodyKeys = new Set(['traceId', 'spanId']);

function convertValueToAnyValue(value: unknown): AnyValue | null {
  if (value == null) return null;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  const normalized = normalizeLogValue(value, { bytesAsSummary: false });
  if (normalized == null) return null;

  if (
    typeof normalized === 'string' ||
    typeof normalized === 'number' ||
    typeof normalized === 'boolean'
  ) {
    return normalized;
  }
  if (normalized instanceof Uint8Array) return normalized;

  if (Array.isArray(normalized)) {
    const converted: AnyValue[] = [];
    for (const item of normalized) {
      const convertedItem = convertValueToAnyValue(item);
      if (convertedItem !== null) {
        converted.push(convertedItem);
      }
    }
    return converted;
  }

  if (typeof normalized === 'object') {
    const converted: Record<string, AnyValue> = {};
    for (const [key, val] of Object.entries(normalized as Record<string, unknown>)) {
      const convertedVal = convertValueToAnyValue(val);
      if (convertedVal !== null) {
        converted[key] = convertedVal;
      }
    }
    return converted;
  }

  return String(normalized);
}

function serializeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    const serialized: Record<string, unknown> = {
      name: value.name,
      message: value.message
    };

    if (typeof value.stack === 'string') {
      serialized.stack = value.stack;
    }

    const cause = (value as { cause?: unknown }).cause;
    if (cause !== undefined) {
      serialized.cause = serializeValue(cause, seen);
    }

    if (typeof AggregateError !== 'undefined' && value instanceof AggregateError) {
      serialized.errors = value.errors.map((error) => serializeValue(error, seen));
    }

    for (const key of Object.keys(value)) {
      if (!(key in serialized)) {
        serialized[key] = serializeValue((value as unknown as Record<string, unknown>)[key], seen);
      }
    }

    return serialized;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item, seen));
  }

  if (value !== null && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    const serialized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      serialized[key] = serializeValue(val, seen);
    }
    return serialized;
  }

  return value;
}

function normalizeLogValue(value: unknown, options: SafeNormalizeOptions = {}): unknown {
  const {
    seen = new WeakSet<object>(),
    depth = 0,
    maxDepth = defaultMaxNormalizeDepth,
    maxKeys = defaultMaxObjectKeys,
    bytesAsSummary = false
  } = options;

  if (value == null) return null;

  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
    return value;
  }
  if (valueType === 'bigint') return value.toString();
  if (valueType === 'symbol') return value.toString();
  if (valueType === 'function') {
    return `[Function ${(value as { name?: string }).name || 'anonymous'}]`;
  }

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return serializeValue(value, seen);
  if (value instanceof Uint8Array) {
    return bytesAsSummary ? `[${value.constructor.name} length=${value.byteLength}]` : value;
  }

  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  if (depth >= maxDepth) return '[MaxDepth]';

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) =>
      normalizeLogValue(item, { seen, depth: depth + 1, maxDepth, maxKeys, bytesAsSummary })
    );
  }

  if (value instanceof Map) {
    const normalized: Record<string, unknown> = {};
    let count = 0;
    for (const [key, val] of value.entries()) {
      if (count >= maxKeys) {
        normalized.__truncated = true;
        break;
      }
      normalized[String(key)] = normalizeLogValue(val, {
        seen,
        depth: depth + 1,
        maxDepth,
        maxKeys,
        bytesAsSummary
      });
      count += 1;
    }
    return normalized;
  }

  if (value instanceof Set) {
    return Array.from(value.values()).map((item) =>
      normalizeLogValue(item, { seen, depth: depth + 1, maxDepth, maxKeys, bytesAsSummary })
    );
  }

  const proto = Object.getPrototypeOf(value);
  const isPlainObject = proto === Object.prototype || proto === null;
  const normalized: Record<string, unknown> = {};

  if (!isPlainObject && value.constructor?.name) {
    normalized.__type = value.constructor.name;
  }

  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 && !isPlainObject) {
    return nodeInspect(value);
  }

  for (const [index, [key, val]] of entries.entries()) {
    if (index >= maxKeys) {
      normalized.__truncated = true;
      break;
    }

    normalized[key] = normalizeLogValue(val, {
      seen,
      depth: depth + 1,
      maxDepth,
      maxKeys,
      bytesAsSummary
    });
  }

  return normalized;
}

function convertMessageToText(record: LogRecord): AnyValue {
  const { message } = record;
  let body = '';
  for (let i = 0; i < message.length; i += 2) {
    const msg = message[i] as string;
    body += msg;
    if (message.length <= i + 1) break;

    const value = message[i + 1];
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      body += value.toString();
      continue;
    }
    if (value instanceof Date) {
      body += value.toISOString();
    }
  }

  const trimmed = body.trimEnd().replace(/[:：,，]\s*$/, '');
  return trimmed || getStructuredLogFallback(record);
}

function getRawMessageText(record: LogRecord): string {
  if (typeof record.rawMessage === 'string') {
    return record.rawMessage;
  }

  return Array.from(record.rawMessage).join('');
}

function getStructuredLogFallback(record: LogRecord): string {
  const rawMessage = getRawMessageText(record);
  return rawMessage === '{*}' ? 'structured log' : rawMessage;
}

function convertRecordToStructuredBody(record: LogRecord): AnyValue {
  const body: Record<string, AnyValue> = {
    __log_message: convertMessageToText(record)
  };

  for (const [key, value] of Object.entries(record.properties ?? {})) {
    if (reservedStructuredBodyKeys.has(key)) continue;

    const convertedValue = convertValueToAnyValue(value);
    if (convertedValue !== null) {
      body[key] = convertedValue;
    }
  }

  return body;
}

class DiagLoggerAdaptor implements DiagLogger {
  logger: Logger;

  constructor() {
    this.logger = getLogger(['logtape', 'meta', 'otel']);
  }

  #escape(msg: string): string {
    return msg.replaceAll('{', '{{').replaceAll('}', '}}');
  }

  error(msg: string, ...values: unknown[]): void {
    this.logger.error(`${this.#escape(msg)}: {values}`, { values });
  }

  warn(msg: string, ...values: unknown[]): void {
    this.logger.warn(`${this.#escape(msg)}: {values}`, { values });
  }

  info(msg: string, ...values: unknown[]): void {
    this.logger.info(`${this.#escape(msg)}: {values}`, { values });
  }

  debug(msg: string, ...values: unknown[]): void {
    this.logger.debug(`${this.#escape(msg)}: {values}`, { values });
  }

  verbose(msg: string, ...values: unknown[]): void {
    this.logger.debug(`${this.#escape(msg)}: {values}`, { values });
  }
}
