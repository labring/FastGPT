import { registerOTel, OTLPHttpJsonTraceExporter } from '@vercel/otel';
// Add otel logging
import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { SignozBaseURL, SignozServiceName } from './const';
import { addLog } from '../../common/system/log';
diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO); // set diaglog level to DEBUG when debugging

export function connectSignoz() {
  if (!SignozBaseURL) {
    return;
  }
  addLog.info(`Connecting signoz, ${SignozBaseURL}, ${SignozServiceName}`);
  return registerOTel({
    serviceName: SignozServiceName,
    traceExporter: new OTLPHttpJsonTraceExporter({
      url: `${SignozBaseURL}/v1/traces`
    })
  });
}
