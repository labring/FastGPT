import { getMeter } from '../../common/metrics';

type MetricAttributeValue = string | number | boolean;
type MetricAttributes = Record<string, MetricAttributeValue>;

export type WorkflowStepMetricAttributes = {
  workflowId?: string;
  workflowName?: string;
  nodeId: string;
  nodeName?: string;
  nodeType: string;
  mode?: string;
};

type ProcessSnapshot = {
  rss: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
  cpuUser: number;
  cpuSystem: number;
};

type StepObservationState = {
  startedAt: bigint;
  startSnapshot: ProcessSnapshot;
  hadOverlapAtStart: boolean;
  overlapVersionAtStart: number;
};

function normalizeAttributes(attributes: Record<string, unknown>): MetricAttributes {
  const normalized: MetricAttributes = {};

  Object.entries(attributes).forEach(([key, value]) => {
    if (value === undefined || value === null) return;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      normalized[key] = value;
    }
  });

  return normalized;
}

function toMetricAttributes(
  attributes: WorkflowStepMetricAttributes,
  extras?: Record<string, unknown>
) {
  return normalizeAttributes({
    workflow_id: attributes.workflowId,
    workflow_name: attributes.workflowName,
    node_id: attributes.nodeId,
    node_name: attributes.nodeName,
    node_type: attributes.nodeType,
    mode: attributes.mode,
    ...extras
  });
}

function takeProcessSnapshot(): ProcessSnapshot {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();

  return {
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    external: memory.external,
    arrayBuffers: memory.arrayBuffers,
    cpuUser: cpu.user,
    cpuSystem: cpu.system
  };
}

let activeWorkflowStepCount = 0;
let overlapVersion = 0;

function beginStepObservation(): StepObservationState {
  const state: StepObservationState = {
    startedAt: process.hrtime.bigint(),
    startSnapshot: takeProcessSnapshot(),
    hadOverlapAtStart: activeWorkflowStepCount > 0,
    overlapVersionAtStart: overlapVersion
  };

  activeWorkflowStepCount += 1;

  if (activeWorkflowStepCount > 1) {
    overlapVersion += 1;
  }

  return state;
}

const meter = getMeter('fastgpt.workflow');
const prefix = 'fastgpt.workflow';

const stepDuration = meter.createHistogram(`${prefix}.step.duration`, {
  description: 'Workflow step execution duration',
  unit: 'ms'
});
const stepExecutions = meter.createCounter(`${prefix}.step.executions`, {
  description: 'Workflow step execution count'
});
const stepActive = meter.createUpDownCounter(`${prefix}.step.active`, {
  description: 'Workflow steps currently executing'
});
const stepCpuUserTime = meter.createHistogram(`${prefix}.step.cpu.user_time`, {
  description: 'Workflow step user CPU time',
  unit: 'us'
});
const stepCpuSystemTime = meter.createHistogram(`${prefix}.step.cpu.system_time`, {
  description: 'Workflow step system CPU time',
  unit: 'us'
});
const stepMemoryRssStart = meter.createHistogram(`${prefix}.step.memory.rss_start`, {
  description: 'Workflow process RSS memory snapshot at step start',
  unit: 'By'
});
const stepMemoryHeapUsedStart = meter.createHistogram(`${prefix}.step.memory.heap_used_start`, {
  description: 'Workflow process heap used memory snapshot at step start',
  unit: 'By'
});
const stepMemoryExternalStart = meter.createHistogram(`${prefix}.step.memory.external_start`, {
  description: 'Workflow process external memory snapshot at step start',
  unit: 'By'
});
const stepMemoryArrayBuffersStart = meter.createHistogram(
  `${prefix}.step.memory.array_buffers_start`,
  {
    description: 'Workflow process array buffer memory snapshot at step start',
    unit: 'By'
  }
);
const stepMemoryRss = meter.createHistogram(`${prefix}.step.memory.rss`, {
  description: 'Workflow process RSS memory snapshot at step end',
  unit: 'By'
});
const stepMemoryHeapUsed = meter.createHistogram(`${prefix}.step.memory.heap_used`, {
  description: 'Workflow process heap used memory snapshot at step end',
  unit: 'By'
});
const stepMemoryExternal = meter.createHistogram(`${prefix}.step.memory.external`, {
  description: 'Workflow process external memory snapshot at step end',
  unit: 'By'
});
const stepMemoryArrayBuffers = meter.createHistogram(`${prefix}.step.memory.array_buffers`, {
  description: 'Workflow process array buffer memory snapshot at step end',
  unit: 'By'
});
const stepMemoryRssGrowth = meter.createHistogram(`${prefix}.step.memory.rss_growth`, {
  description: 'Workflow process RSS memory growth during non-overlapping step execution',
  unit: 'By'
});
const stepMemoryHeapUsedGrowth = meter.createHistogram(`${prefix}.step.memory.heap_used_growth`, {
  description: 'Workflow process heap used memory growth during non-overlapping step execution',
  unit: 'By'
});
const stepMemoryExternalGrowth = meter.createHistogram(`${prefix}.step.memory.external_growth`, {
  description: 'Workflow process external memory growth during non-overlapping step execution',
  unit: 'By'
});

export async function observeWorkflowStep<T>(
  attributes: WorkflowStepMetricAttributes,
  fn: () => Promise<T> | T
): Promise<T> {
  const observationState = beginStepObservation();
  const baseAttributes = toMetricAttributes(attributes);

  stepActive.add(1, baseAttributes);

  try {
    const result = await fn();
    recordWorkflowStepEnd(attributes, observationState, 'ok', baseAttributes);
    return result;
  } catch (error) {
    recordWorkflowStepEnd(attributes, observationState, 'error', baseAttributes);
    throw error;
  }
}

function recordWorkflowStepEnd(
  attributes: WorkflowStepMetricAttributes,
  observationState: StepObservationState,
  status: 'ok' | 'error',
  baseAttributes: MetricAttributes
) {
  const endSnapshot = takeProcessSnapshot();
  const metricAttributes = toMetricAttributes(attributes, { status });
  const stepOverlap =
    observationState.hadOverlapAtStart || observationState.overlapVersionAtStart !== overlapVersion;
  const memoryAttributes = toMetricAttributes(attributes, {
    status,
    memory_scope: 'process',
    memory_attribution: stepOverlap ? 'best_effort' : 'exclusive',
    step_overlap: stepOverlap
  });
  const durationMs = Number(process.hrtime.bigint() - observationState.startedAt) / 1_000_000;

  stepDuration.record(durationMs, metricAttributes);
  stepExecutions.add(1, metricAttributes);
  stepCpuUserTime.record(
    Math.max(0, endSnapshot.cpuUser - observationState.startSnapshot.cpuUser),
    metricAttributes
  );
  stepCpuSystemTime.record(
    Math.max(0, endSnapshot.cpuSystem - observationState.startSnapshot.cpuSystem),
    metricAttributes
  );

  stepMemoryRssStart.record(observationState.startSnapshot.rss, memoryAttributes);
  stepMemoryHeapUsedStart.record(observationState.startSnapshot.heapUsed, memoryAttributes);
  stepMemoryExternalStart.record(observationState.startSnapshot.external, memoryAttributes);
  stepMemoryArrayBuffersStart.record(observationState.startSnapshot.arrayBuffers, memoryAttributes);
  stepMemoryRss.record(endSnapshot.rss, memoryAttributes);
  stepMemoryHeapUsed.record(endSnapshot.heapUsed, memoryAttributes);
  stepMemoryExternal.record(endSnapshot.external, memoryAttributes);
  stepMemoryArrayBuffers.record(endSnapshot.arrayBuffers, memoryAttributes);

  if (!stepOverlap && endSnapshot.rss > observationState.startSnapshot.rss) {
    stepMemoryRssGrowth.record(
      endSnapshot.rss - observationState.startSnapshot.rss,
      memoryAttributes
    );
  }
  if (!stepOverlap && endSnapshot.heapUsed > observationState.startSnapshot.heapUsed) {
    stepMemoryHeapUsedGrowth.record(
      endSnapshot.heapUsed - observationState.startSnapshot.heapUsed,
      memoryAttributes
    );
  }
  if (!stepOverlap && endSnapshot.external > observationState.startSnapshot.external) {
    stepMemoryExternalGrowth.record(
      endSnapshot.external - observationState.startSnapshot.external,
      memoryAttributes
    );
  }

  activeWorkflowStepCount = Math.max(0, activeWorkflowStepCount - 1);
  stepActive.add(-1, baseAttributes);
}
