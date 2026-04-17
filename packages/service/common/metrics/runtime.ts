import type {
  BatchObservableCallback,
  Meter,
  Observable,
  ObservableGauge
} from '@opentelemetry/api';
import { getMeter } from '@fastgpt-sdk/otel/metrics';
import { cpus } from 'os';

type RuntimeMetricAttributes = Record<string, never>;

type RuntimeObservableSet = {
  meter: Meter;
  processMemoryRss: ObservableGauge<RuntimeMetricAttributes>;
  processMemoryHeapUsed: ObservableGauge<RuntimeMetricAttributes>;
  processMemoryHeapTotal: ObservableGauge<RuntimeMetricAttributes>;
  processMemoryExternal: ObservableGauge<RuntimeMetricAttributes>;
  processMemoryArrayBuffers: ObservableGauge<RuntimeMetricAttributes>;
  processCpuUser: ObservableGauge<RuntimeMetricAttributes>;
  processCpuSystem: ObservableGauge<RuntimeMetricAttributes>;
  processCpuUtilization: ObservableGauge<RuntimeMetricAttributes>;
  processUptime: ObservableGauge<RuntimeMetricAttributes>;
};

const prefix = 'fastgpt.runtime.process';

let runtimeMetricsRegistered = false;
let runtimeMeter: Meter | undefined;
let runtimeObservables: Observable<RuntimeMetricAttributes>[] = [];
let runtimeMetricsCallback: BatchObservableCallback<RuntimeMetricAttributes> | undefined;

let previousCpuUsage: NodeJS.CpuUsage | undefined;
let previousCpuTimestamp: number | undefined;

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
    processCpuUser: meter.createObservableGauge(`${prefix}.cpu.user`, {
      description: 'Cumulative user CPU time of the current process',
      unit: 'us'
    }),
    processCpuSystem: meter.createObservableGauge(`${prefix}.cpu.system`, {
      description: 'Cumulative system CPU time of the current process',
      unit: 'us'
    }),
    processCpuUtilization: meter.createObservableGauge(`${prefix}.cpu.utilization`, {
      description: 'CPU utilization ratio of the current process (0~1, across all cores)',
      unit: '1'
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
    observables.processCpuUser,
    observables.processCpuSystem,
    observables.processCpuUtilization,
    observables.processUptime
  ];
  runtimeMetricsCallback = (result) => {
    const memoryUsage = process.memoryUsage();

    result.observe(observables.processMemoryRss, memoryUsage.rss);
    result.observe(observables.processMemoryHeapUsed, memoryUsage.heapUsed);
    result.observe(observables.processMemoryHeapTotal, memoryUsage.heapTotal);
    result.observe(observables.processMemoryExternal, memoryUsage.external);
    result.observe(observables.processMemoryArrayBuffers, memoryUsage.arrayBuffers);

    const currentCpuUsage = process.cpuUsage();
    const currentTimestamp = Date.now();

    result.observe(observables.processCpuUser, currentCpuUsage.user);
    result.observe(observables.processCpuSystem, currentCpuUsage.system);

    if (previousCpuUsage && previousCpuTimestamp) {
      const elapsedUs = (currentTimestamp - previousCpuTimestamp) * 1000;
      if (elapsedUs > 0) {
        const cpuDeltaUs =
          currentCpuUsage.user -
          previousCpuUsage.user +
          (currentCpuUsage.system - previousCpuUsage.system);
        const coreCount = cpus().length || 1;
        const utilization = cpuDeltaUs / (elapsedUs * coreCount);
        result.observe(observables.processCpuUtilization, Math.min(1, Math.max(0, utilization)));
      }
    }

    previousCpuUsage = currentCpuUsage;
    previousCpuTimestamp = currentTimestamp;

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
  previousCpuUsage = undefined;
  previousCpuTimestamp = undefined;
}
