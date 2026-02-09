import type { Config } from '@logtape/logtape';
import { getConsoleSink } from '@logtape/logtape';
import { getPrettyFormatter } from '@logtape/pretty';
import { getOpenTelemetrySink } from './otel';
import dayjs from 'dayjs';

type SinkId = 'console' | 'jsonl' | 'otel';
type FilterId = string;
type LogTapeConfig<S extends string = SinkId, F extends string = FilterId> = Config<S, F>;
type SinkConfig = LogTapeConfig<string>['sinks'];

type CreateSinksOptions = {
  enableConsole: boolean;
  enableOtel: boolean;
  otelServiceName: string;
  otelUrl?: string;
};

type CreateSinksResult = {
  sinks: SinkConfig;
  composedSinks: SinkId[];
};

export async function createSinks(options: CreateSinksOptions): Promise<CreateSinksResult> {
  const { enableConsole, enableOtel, otelServiceName, otelUrl } = options;

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
    });
    composedSinks.push('console');
    console.log('✓ Logtape console sink enabled');
  }

  if (enableOtel) {
    if (!otelUrl) {
      throw new Error('LOG_OTEL_URL is required when LOG_ENABLE_OTEL is true');
    }

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

  return { sinks, composedSinks };
}
