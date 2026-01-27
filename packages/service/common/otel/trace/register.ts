import { registerOTel, OTLPHttpJsonTraceExporter } from '@vercel/otel';
import { SignozBaseURL, SignozServiceName } from '../const';
import { getLogger, infra } from '../../logger';

export function connectSignoz() {
  if (!SignozBaseURL) {
    return;
  }
  const logger = getLogger(infra.otel);
  logger.info(`Connecting signoz, ${SignozBaseURL}, ${SignozServiceName}`);
  return registerOTel({
    serviceName: SignozServiceName,
    traceExporter: new OTLPHttpJsonTraceExporter({
      url: `${SignozBaseURL}/v1/traces`
    })
  });
}
