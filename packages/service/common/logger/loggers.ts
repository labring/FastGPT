import type { Config } from '@logtape/logtape';

type SinkId = 'console' | 'jsonl' | 'otel';
type FilterId = string;
type LogTapeConfig<S extends string = SinkId, F extends string = FilterId> = Config<S, F>;
type LoggerConfig = LogTapeConfig['loggers'];

type CreateLoggersOptions = {
  composedSinks: SinkId[];
  enableDebugLevel: boolean;
};

export function createLoggers(options: CreateLoggersOptions) {
  const { composedSinks, enableDebugLevel } = options;

  const loggers: LoggerConfig = [
    // logtape 内部日志
    {
      category: ['logtape', 'meta'],
      lowestLevel: 'error',
      sinks: enableDebugLevel ? ['console'] : []
    },
    // 应用层日志
    {
      category: ['app'],
      lowestLevel: enableDebugLevel ? 'debug' : 'info',
      sinks: composedSinks
    },
    // 错误层日志
    {
      category: ['error'],
      lowestLevel: enableDebugLevel ? 'debug' : 'error',
      sinks: composedSinks
    },
    // HTTP 层日志
    {
      category: ['http'],
      lowestLevel: enableDebugLevel ? 'debug' : 'info',
      sinks: composedSinks
    },
    // 基础设施层日志
    {
      category: ['infra'],
      lowestLevel: enableDebugLevel ? 'debug' : 'info',
      sinks: composedSinks
    },
    // 业务模块层日志
    {
      category: ['mod'],
      lowestLevel: enableDebugLevel ? 'debug' : 'info',
      sinks: composedSinks
    },
    // 事件层日志
    {
      category: ['event'],
      lowestLevel: enableDebugLevel ? 'debug' : 'info',
      sinks: composedSinks
    }
  ];

  return loggers;
}
