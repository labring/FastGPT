import type {
  BatchObservableCallback,
  Meter,
  Observable,
  ObservableGauge
} from '@opentelemetry/api';
import { getMeter } from '@fastgpt-sdk/otel/metrics';

type RuntimeMetricAttributes = Record<string, never>;

type RuntimeObservableSet = {
  meter: Meter;
  processMemoryRss: ObservableGauge<RuntimeMetricAttributes>;
  processMemoryHeapUsed: ObservableGauge<RuntimeMetricAttributes>;
  processMemoryHeapTotal: ObservableGauge<RuntimeMetricAttributes>;
  processMemoryExternal: ObservableGauge<RuntimeMetricAttributes>;
  processMemoryArrayBuffers: ObservableGauge<RuntimeMetricAttributes>;
  processUptime: ObservableGauge<RuntimeMetricAttributes>;
};

const prefix = 'fastgpt.runtime.process';

let runtimeMetricsRegistered = false;
let runtimeMeter: Meter | undefined;
let runtimeObservables: Observable<RuntimeMetricAttributes>[] = [];
let runtimeMetricsCallback: BatchObservableCallback<RuntimeMetricAttributes> | undefined;

function createRuntimeObservables(): RuntimeObservableSet {
  const meter = getMeter('fastgpt.runtime');

  return {
    meter,
    processMemoryRss: meter.createObservableGauge(`${prefix}.memory.rss`, {
      description: 'Resident set size memory used by the current process',
      unit: 'By'
    }),
    processMemoryHeapUsed: meter.createObservableGauge(`${prefix}.memory.heap_used`, {
      description: 'V8 heap memory currently used by the current process',
      unit: 'By'
    }),
    processMemoryHeapTotal: meter.createObservableGauge(`${prefix}.memory.heap_total`, {
      description: 'Total V8 heap memory allocated for the current process',
      unit: 'By'
    }),
    processMemoryExternal: meter.createObservableGauge(`${prefix}.memory.external`, {
      description: 'Memory used by C++ objects bound to JavaScript objects',
      unit: 'By'
    }),
    processMemoryArrayBuffers: meter.createObservableGauge(`${prefix}.memory.array_buffers`, {
      description: 'Memory allocated for ArrayBuffer and SharedArrayBuffer instances',
      unit: 'By'
    }),
    processUptime: meter.createObservableGauge(`${prefix}.uptime`, {
      description: 'Process uptime',
      unit: 's'
    })
  };
}

export function startRuntimeMetrics() {
  if (runtimeMetricsRegistered) return;

  const observables = createRuntimeObservables();
  runtimeMeter = observables.meter;

  runtimeObservables = [
    observables.processMemoryRss,
    observables.processMemoryHeapUsed,
    observables.processMemoryHeapTotal,
    observables.processMemoryExternal,
    observables.processMemoryArrayBuffers,
    observables.processUptime
  ];
  runtimeMetricsCallback = (result) => {
    const memoryUsage = process.memoryUsage();

    result.observe(observables.processMemoryRss, memoryUsage.rss);
    result.observe(observables.processMemoryHeapUsed, memoryUsage.heapUsed);
    result.observe(observables.processMemoryHeapTotal, memoryUsage.heapTotal);
    result.observe(observables.processMemoryExternal, memoryUsage.external);
    result.observe(observables.processMemoryArrayBuffers, memoryUsage.arrayBuffers);
    result.observe(observables.processUptime, process.uptime());
  };

  runtimeMeter.addBatchObservableCallback(runtimeMetricsCallback, runtimeObservables);
  runtimeMetricsRegistered = true;
}

export function stopRuntimeMetrics() {
  if (!runtimeMetricsRegistered || !runtimeMetricsCallback || !runtimeMeter) return;

  runtimeMeter.removeBatchObservableCallback(runtimeMetricsCallback, runtimeObservables);

  runtimeMetricsRegistered = false;
  runtimeMeter = undefined;
  runtimeObservables = [];
  runtimeMetricsCallback = undefined;
}
