import {
  configureMetricsFromEnv,
  disposeMetrics as disposeOtelMetrics,
  getMeter
} from '@fastgpt-sdk/otel/metrics';
import { env } from '../../env';
import { startRuntimeMetrics, stopRuntimeMetrics } from './runtime';

export async function configureMetrics() {
  await configureMetricsFromEnv({
    env,
    defaultServiceName: 'fastgpt-client',
    defaultMeterName: 'fastgpt-client'
  });

  startRuntimeMetrics();
}

export async function disposeMetrics() {
  stopRuntimeMetrics();
  await disposeOtelMetrics();
}

export { getMeter };
