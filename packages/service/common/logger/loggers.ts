import type { Config, LogLevel } from '@logtape/logtape';
import { moduleCategories } from './categories';

type SinkId = 'console' | 'jsonl' | 'otel';
type FilterId = string;
type LogTapeConfig<S extends string = SinkId, F extends string = FilterId> = Config<S, F>;
type LoggerConfig = LogTapeConfig['loggers'];

type CreateLoggersOptions = {
  composedSinks: SinkId[];
};

export function createLoggers(options: CreateLoggersOptions) {
  const { composedSinks } = options;

  const loggers: LoggerConfig = [
    {
      category: [],
      lowestLevel: 'trace',
      sinks: ['console']
    },
    // logtape 内部日志
    {
      category: ['logtape', 'meta'],
      lowestLevel: 'fatal',
      parentSinks: 'override',
      sinks: ['console']
    },
    // 应用层日志
    {
      category: ['system'],
      lowestLevel: 'trace',
      parentSinks: 'override',
      sinks: composedSinks
    },
    // 错误层日志
    {
      category: ['error'],
      lowestLevel: 'error',
      parentSinks: 'override',
      sinks: composedSinks
    },
    // HTTP 层日志
    {
      category: ['http'],
      lowestLevel: 'trace',
      parentSinks: 'override',
      sinks: composedSinks
    },
    // 基础设施层日志
    {
      category: ['infra'],
      lowestLevel: 'trace',
      parentSinks: 'override',
      sinks: composedSinks
    },
    // 业务模块层日志
    ...moduleCategories.map(
      (category) =>
        ({
          category: [category],
          lowestLevel: 'trace' as const,
          parentSinks: 'override',
          sinks: composedSinks
        }) satisfies LoggerConfig[number]
    ),
    // 事件层日志
    {
      category: ['event'],
      lowestLevel: 'trace',
      parentSinks: 'override',
      sinks: composedSinks
    }
  ];

  return loggers;
}
