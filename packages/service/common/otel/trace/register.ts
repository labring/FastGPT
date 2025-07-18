import { registerOTel, OTLPHttpJsonTraceExporter } from '@vercel/otel';
import { SignozBaseURL, SignozServiceName } from '../const';
import { addLog } from '../../system/log';

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
