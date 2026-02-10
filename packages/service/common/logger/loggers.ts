import type { Config, LogLevel } from '@logtape/logtape';
import { moduleCategories } from './categories';

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

  const level: LogLevel = enableDebugLevel ? 'debug' : 'info';

  const loggers: LoggerConfig = [
    // logtape 内部日志
    {
      category: ['logtape', 'meta'],
      lowestLevel: 'error',
      sinks: enableDebugLevel ? ['console'] : []
    },
    // 应用层日志
    {
      category: ['system'],
      lowestLevel: level,
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
      lowestLevel: level,
      sinks: composedSinks
    },
    // 基础设施层日志
    {
      category: ['infra'],
      lowestLevel: level,
      sinks: composedSinks
    },
    // 业务模块层日志
    ...moduleCategories.map((category) => ({
      category: [category],
      lowestLevel: level,
      sinks: composedSinks
    })),
    // 事件层日志
    {
      category: ['event'],
      lowestLevel: level,
      sinks: composedSinks
    }
  ];

  return loggers;
}
