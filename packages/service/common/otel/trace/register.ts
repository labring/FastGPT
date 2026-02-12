import { registerOTel, OTLPHttpJsonTraceExporter } from '@vercel/otel';
import { SignozBaseURL, SignozServiceName } from '../const';
import { getLogger, LogCategories } from '../../logger';

const logger = getLogger(LogCategories.INFRA.OTEL);

export function connectSignoz() {
  if (!SignozBaseURL) {
    return;
  }
  logger.info('Connecting to SigNoz', {
    url: SignozBaseURL,
    serviceName: SignozServiceName
  });
  return registerOTel({
    serviceName: SignozServiceName,
    traceExporter: new OTLPHttpJsonTraceExporter({
      url: `${SignozBaseURL}/v1/traces`
    })
  });
}
