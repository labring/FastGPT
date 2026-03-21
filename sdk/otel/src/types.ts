import type { LoggerConfigureOptions } from './logger';
import type { MetricsConfigureOptions } from './metrics';
import type { TracingConfigureOptions } from './tracing';

export type OtelConfigureOptions = {
  logger?: LoggerConfigureOptions;
  metrics?: MetricsConfigureOptions;
  tracing?: TracingConfigureOptions;
};
