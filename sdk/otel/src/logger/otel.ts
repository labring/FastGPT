import { getLogger, type Logger, type LogRecord, type Sink } from '@logtape/logtape';
import { diag, type DiagLogger, DiagLogLevel } from '@opentelemetry/api';
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
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
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

export type ObjectRenderer = 'json' | 'inspect';

type Message = (string | null | undefined)[];

export type BodyFormatter = (message: Message) => AnyValue;

export type ExceptionAttributeMode = 'semconv' | 'raw' | false;

interface OpenTelemetrySinkOptionsBase {
  messageType?: 'string' | 'array' | BodyFormatter;
  objectRenderer?: ObjectRenderer;
  exceptionAttributes?: ExceptionAttributeMode;
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
    processors: [new SimpleLogRecordProcessor(otlpExporter)]
  });

  return loggerProvider;
}

function emitLogRecord(
  logger: OTLogger,
  record: LogRecord,
  options: OpenTelemetrySinkOptions
): void {
  const objectRenderer = options.objectRenderer ?? 'inspect';
  const exceptionMode = options.exceptionAttributes ?? 'semconv';
  const { category, level, message, timestamp, properties } = record;
  const severityNumber = mapLevelToSeverityNumber(level);
  const attributes = convertToAttributes(properties ?? {}, objectRenderer, exceptionMode);

  attributes['category'] = [...category];

  logger.emit({
    severityNumber,
    severityText: level,
    body:
      typeof options.messageType === 'function'
        ? convertMessageToCustomBodyFormat(
            message,
            objectRenderer,
            exceptionMode,
            options.messageType
          )
        : options.messageType === 'array'
          ? convertMessageToArray(message, objectRenderer, exceptionMode)
          : convertMessageToString(message, objectRenderer, exceptionMode),
    attributes,
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
        emitLogRecord(logger, record, options);
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
        emitLogRecord(logger, record, options);
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
              emitLogRecord(logger, pendingRecord, options);
            }
            pendingRecords = [];
          })
          .catch((error) => {
            initError = error as Error;
            pendingRecords = [];
            // eslint-disable-next-line no-console
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

function convertValueToAnyValue(
  value: unknown,
  objectRenderer: ObjectRenderer,
  exceptionMode: ExceptionAttributeMode
): AnyValue | null {
  if (value == null) return null;

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    let primitiveType: string | null = null;
    let isHomogeneous = true;

    for (const item of value) {
      if (item == null) continue;
      const itemType = typeof item;
      if (itemType !== 'string' && itemType !== 'number' && itemType !== 'boolean') {
        isHomogeneous = false;
        break;
      }
      if (primitiveType === null) {
        primitiveType = itemType;
      } else if (primitiveType !== itemType) {
        isHomogeneous = false;
        break;
      }
    }

    if (isHomogeneous && primitiveType !== null) {
      return value as AnyValue;
    }

    const converted: AnyValue[] = [];
    for (const item of value) {
      const convertedItem = convertValueToAnyValue(item, objectRenderer, exceptionMode);
      if (convertedItem !== null) {
        converted.push(convertedItem);
      }
    }
    return converted;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    const errorObj = serializeValue(value) as Record<string, unknown>;
    const converted: Record<string, AnyValue> = {};
    for (const [key, val] of Object.entries(errorObj)) {
      const convertedVal = convertValueToAnyValue(val, objectRenderer, exceptionMode);
      if (convertedVal !== null) {
        converted[key] = convertedVal;
      }
    }
    return converted;
  }

  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    const isPlainObject = proto === Object.prototype || proto === null;

    if (isPlainObject) {
      const converted: Record<string, AnyValue> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        const convertedVal = convertValueToAnyValue(val, objectRenderer, exceptionMode);
        if (convertedVal !== null) {
          converted[key] = convertedVal;
        }
      }
      return converted;
    }

    if (objectRenderer === 'inspect') {
      return nodeInspect(value);
    }
    return JSON.stringify(value);
  }

  return String(value);
}

function convertToAttributes(
  properties: Record<string, unknown>,
  objectRenderer: ObjectRenderer,
  exceptionMode: ExceptionAttributeMode
): Record<string, AnyValue> {
  const attributes: Record<string, AnyValue> = {};
  for (const [name, value] of Object.entries(properties)) {
    if (value == null) continue;

    if (value instanceof Error && exceptionMode === 'semconv') {
      attributes['exception.type'] = value.name;
      attributes['exception.message'] = value.message;
      if (typeof value.stack === 'string') {
        attributes['exception.stacktrace'] = value.stack;
      }
      continue;
    }

    const convertedValue = convertValueToAnyValue(value, objectRenderer, exceptionMode);
    if (convertedValue !== null) {
      attributes[name] = convertedValue;
    }
  }
  return attributes;
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Error) {
    const serialized: Record<string, unknown> = {
      name: value.name,
      message: value.message
    };

    if (typeof value.stack === 'string') {
      serialized.stack = value.stack;
    }

    const cause = (value as { cause?: unknown }).cause;
    if (cause !== undefined) {
      serialized.cause = serializeValue(cause);
    }

    if (typeof AggregateError !== 'undefined' && value instanceof AggregateError) {
      serialized.errors = value.errors.map(serializeValue);
    }

    for (const key of Object.keys(value)) {
      if (!(key in serialized)) {
        serialized[key] = serializeValue((value as unknown as Record<string, unknown>)[key]);
      }
    }

    return serialized;
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value !== null && typeof value === 'object') {
    const serialized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      serialized[key] = serializeValue(val);
    }
    return serialized;
  }

  return value;
}

function convertToString(
  value: unknown,
  objectRenderer: ObjectRenderer,
  exceptionMode: ExceptionAttributeMode
): string | null | undefined {
  if (value === null || value === undefined || typeof value === 'string') {
    return value;
  }
  if (objectRenderer === 'inspect') return nodeInspect(value);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error && (exceptionMode === 'raw' || exceptionMode === 'semconv')) {
    return JSON.stringify(serializeValue(value));
  }
  return JSON.stringify(value);
}

function convertMessageToArray(
  message: readonly unknown[],
  objectRenderer: ObjectRenderer,
  exceptionMode: ExceptionAttributeMode
): AnyValue {
  const body: (string | null | undefined)[] = [];
  for (let i = 0; i < message.length; i += 2) {
    const msg = message[i] as string;
    body.push(msg);
    if (message.length <= i + 1) break;
    const val = message[i + 1];
    body.push(convertToString(val, objectRenderer, exceptionMode));
  }
  return body;
}

function convertMessageToString(
  message: readonly unknown[],
  objectRenderer: ObjectRenderer,
  exceptionMode: ExceptionAttributeMode
): AnyValue {
  let body = '';
  for (let i = 0; i < message.length; i += 2) {
    const msg = message[i] as string;
    body += msg;
    if (message.length <= i + 1) break;
    const val = message[i + 1];
    const extra = convertToString(val, objectRenderer, exceptionMode);
    body += extra ?? JSON.stringify(extra);
  }
  return body;
}

function convertMessageToCustomBodyFormat(
  message: readonly unknown[],
  objectRenderer: ObjectRenderer,
  exceptionMode: ExceptionAttributeMode,
  bodyFormatter: BodyFormatter
): AnyValue {
  const body = message.map((msg) => convertToString(msg, objectRenderer, exceptionMode));
  return bodyFormatter(body);
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
