import {
  configureMetricsFromEnv,
  disposeMetrics as disposeOtelMetrics,
  getMeter
} from '@fastgpt-sdk/otel/metrics';
import { serviceEnv } from '../../env';
import { startRuntimeMetrics, stopRuntimeMetrics } from './runtime';

export async function configureMetrics() {
  await configureMetricsFromEnv({
    env: serviceEnv,
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
