import { configureMetricsFromEnv, disposeMetrics, getMeter } from '@fastgpt-sdk/otel/metrics';
import { env } from '../../env';

export async function configureMetrics() {
  await configureMetricsFromEnv({
    env,
    defaultServiceName: 'fastgpt-client',
    defaultMeterName: 'fastgpt-client'
  });
}

export { disposeMetrics, getMeter };
