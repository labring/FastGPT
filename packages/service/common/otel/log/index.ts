import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { SignozBaseURL, SignozServiceName } from '../const';
import { resourceFromAttributes } from '@opentelemetry/resources';
import type { Logger } from '@opentelemetry/api-logs';

export const getLogger = () => {
  if (!global.logger) {
    if (!SignozBaseURL) {
      return null;
    }
    const otlpExporter = new OTLPLogExporter({
      url: `${SignozBaseURL}/v1/logs`,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const loggerProvider = new LoggerProvider({
      processors: [new SimpleLogRecordProcessor(otlpExporter)],
      resource: resourceFromAttributes({
        'service.name': SignozServiceName
      })
    });

    // logsAPI.logs.setGlobalLoggerProvider(loggerProvider);
    global.logger = loggerProvider.getLogger('default');
  }

  return global.logger;
};

declare global {
  var logger: Logger;
}
