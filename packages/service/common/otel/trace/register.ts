import { registerOTel, OTLPHttpJsonTraceExporter } from '@vercel/otel';
// Add otel logging
// import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
import { SignozBaseURL, SignozServiceName } from '../const';
import { addLog } from '../../system/log';
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

export function connectSignoz() {
  if (!SignozBaseURL) {
    addLog.warn('Signoz is not configured');
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
