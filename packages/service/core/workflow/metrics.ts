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
const stepMemoryRss = meter.createHistogram(`${prefix}.step.memory.rss`, {
  description: 'Workflow step end RSS memory',
  unit: 'By'
});
const stepMemoryHeapUsed = meter.createHistogram(`${prefix}.step.memory.heap_used`, {
  description: 'Workflow step end heap used',
  unit: 'By'
});
const stepMemoryExternal = meter.createHistogram(`${prefix}.step.memory.external`, {
  description: 'Workflow step end external memory',
  unit: 'By'
});
const stepMemoryArrayBuffers = meter.createHistogram(`${prefix}.step.memory.array_buffers`, {
  description: 'Workflow step end array buffer memory',
  unit: 'By'
});
const stepMemoryRssGrowth = meter.createHistogram(`${prefix}.step.memory.rss_growth`, {
  description: 'Workflow step RSS growth',
  unit: 'By'
});
const stepMemoryHeapUsedGrowth = meter.createHistogram(`${prefix}.step.memory.heap_used_growth`, {
  description: 'Workflow step heap used growth',
  unit: 'By'
});
const stepMemoryExternalGrowth = meter.createHistogram(`${prefix}.step.memory.external_growth`, {
  description: 'Workflow step external memory growth',
  unit: 'By'
});

export async function observeWorkflowStep<T>(
  attributes: WorkflowStepMetricAttributes,
  fn: () => Promise<T> | T
): Promise<T> {
  const startedAt = process.hrtime.bigint();
  const startSnapshot = takeProcessSnapshot();
  const baseAttributes = toMetricAttributes(attributes);

  stepActive.add(1, baseAttributes);

  try {
    const result = await fn();
    recordWorkflowStepEnd(attributes, startSnapshot, startedAt, 'ok', baseAttributes);
    return result;
  } catch (error) {
    recordWorkflowStepEnd(attributes, startSnapshot, startedAt, 'error', baseAttributes);
    throw error;
  }
}

function recordWorkflowStepEnd(
  attributes: WorkflowStepMetricAttributes,
  startSnapshot: ProcessSnapshot,
  startedAt: bigint,
  status: 'ok' | 'error',
  baseAttributes: MetricAttributes
) {
  const endSnapshot = takeProcessSnapshot();
  const metricAttributes = toMetricAttributes(attributes, { status });
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;

  stepDuration.record(durationMs, metricAttributes);
  stepExecutions.add(1, metricAttributes);
  stepCpuUserTime.record(
    Math.max(0, endSnapshot.cpuUser - startSnapshot.cpuUser),
    metricAttributes
  );
  stepCpuSystemTime.record(
    Math.max(0, endSnapshot.cpuSystem - startSnapshot.cpuSystem),
    metricAttributes
  );

  stepMemoryRss.record(endSnapshot.rss, metricAttributes);
  stepMemoryHeapUsed.record(endSnapshot.heapUsed, metricAttributes);
  stepMemoryExternal.record(endSnapshot.external, metricAttributes);
  stepMemoryArrayBuffers.record(endSnapshot.arrayBuffers, metricAttributes);

  if (endSnapshot.rss > startSnapshot.rss) {
    stepMemoryRssGrowth.record(endSnapshot.rss - startSnapshot.rss, metricAttributes);
  }
  if (endSnapshot.heapUsed > startSnapshot.heapUsed) {
    stepMemoryHeapUsedGrowth.record(
      endSnapshot.heapUsed - startSnapshot.heapUsed,
      metricAttributes
    );
  }
  if (endSnapshot.external > startSnapshot.external) {
    stepMemoryExternalGrowth.record(
      endSnapshot.external - startSnapshot.external,
      metricAttributes
    );
  }

  stepActive.add(-1, baseAttributes);
}
