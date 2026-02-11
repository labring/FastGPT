import type { Config, LogLevel, LogRecord } from '@logtape/logtape';
import { getConsoleSink, withFilter } from '@logtape/logtape';
import { getPrettyFormatter } from '@logtape/pretty';
import { getOpenTelemetrySink } from './otel';
import dayjs from 'dayjs';
import { mapLevelToSeverityNumber, sensitiveProperties } from './helpers';

type SinkId = 'console' | 'jsonl' | 'otel';
type FilterId = string;
type LogTapeConfig<S extends string = SinkId, F extends string = FilterId> = Config<S, F>;
type SinkConfig = LogTapeConfig<string>['sinks'];

type CreateSinksOptions = {
  enableConsole: boolean;
  enableOtel: boolean;
  otelServiceName: string;
  otelUrl?: string;
  consoleLevel?: LogLevel;
  otelLevel?: LogLevel;
};

type CreateSinksResult = {
  sinks: SinkConfig;
  composedSinks: SinkId[];
};

export async function createSinks(options: CreateSinksOptions): Promise<CreateSinksResult> {
  const {
    enableConsole,
    enableOtel,
    otelServiceName,
    otelUrl,
    consoleLevel = 'trace',
    otelLevel = 'info'
  } = options;

  const sinkConfig = {
    bufferSize: 8192,
    flushInterval: 5000,
    nonBlocking: true,
    lazy: true
  } as const;

  const sinks: SinkConfig = {};
  const composedSinks: SinkId[] = [];

  const levelFilter = (record: LogRecord, level: LogLevel) => {
    return mapLevelToSeverityNumber(record.level) >= mapLevelToSeverityNumber(level);
  };

  if (enableConsole) {
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
          timestamp: () => dayjs().format('YYYY-MM-DD HH:mm:ss')
        })
      }),
      (record) => levelFilter(record, consoleLevel)
    );
    composedSinks.push('console');
    console.log('✓ Logtape console sink enabled');
  }

  if (enableOtel) {
    if (!otelUrl) {
      throw new Error('LOG_OTEL_URL is required when LOG_ENABLE_OTEL is true');
    }

    sinks.otel = withFilter(
      getOpenTelemetrySink({
        serviceName: otelServiceName,
        otlpExporterConfig: {
          url: otelUrl
        }
      }),
      (record) => {
        const lvlCd = levelFilter(record, otelLevel);
        const spCd = sensitiveProperties.some((sp) => sp in record.properties);

        return lvlCd && !spCd;
      }
    );

    composedSinks.push('otel');
    console.log(`✓ Logtape OpenTelemetry URL: ${otelUrl}`);
    console.log(`✓ Logtape OpenTelemetry service name: ${otelServiceName}`);
    console.log('✓ Logtape OpenTelemetry enabled');
  }

  return { sinks, composedSinks };
}
