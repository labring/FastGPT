import type { LogTapeConfig, LoggerSinkId } from './types';

type LoggerConfig = LogTapeConfig['loggers'];

type CreateLoggersOptions = {
  composedSinks: LoggerSinkId[];
};

export function createLoggers({ composedSinks }: CreateLoggersOptions): LoggerConfig {
  const metaSinks: LoggerSinkId[] = composedSinks.includes('console') ? ['console'] : composedSinks;

  return [
    {
      category: [],
      lowestLevel: 'trace',
      sinks: composedSinks
    },
    ...(metaSinks.length === 0
      ? []
      : [
          {
            category: ['logtape', 'meta'],
            lowestLevel: 'fatal' as const,
            parentSinks: 'override' as const,
            sinks: metaSinks
          }
        ])
  ];
}
