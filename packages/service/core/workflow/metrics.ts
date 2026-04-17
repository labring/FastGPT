import { getMeter } from '../../common/metrics';

type MetricAttributeValue = string | number | boolean;
type MetricAttributes = Record<string, MetricAttributeValue>;
type ObservationStatus = 'ok' | 'error';

type ObservationState = {
  startedAt: bigint;
};

type ObserveMetricOptions<T> = {
  getStatus?: (result: T) => ObservationStatus;
};

export type WorkflowRunMetricAttributes = {
  mode?: string;
  isRoot?: boolean;
};

export type WorkflowStepMetricAttributes = {
  nodeType: string;
  mode?: string;
};

type ObserveWorkflowRunOptions<T> = ObserveMetricOptions<T> & {
  getRunTimes?: (result: T) => number | undefined;
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

function toRunMetricAttributes(
  attributes: WorkflowRunMetricAttributes,
  extras?: Record<string, unknown>
) {
  return normalizeAttributes({
    mode: attributes.mode,
    is_root: attributes.isRoot,
    ...extras
  });
}

function toStepMetricAttributes(
  attributes: WorkflowStepMetricAttributes,
  extras?: Record<string, unknown>
) {
  return normalizeAttributes({
    node_type: attributes.nodeType,
    mode: attributes.mode,
    ...extras
  });
}

function beginObservation(): ObservationState {
  return {
    startedAt: process.hrtime.bigint()
  };
}

function getObservationDurationMs(state: ObservationState) {
  return Number(process.hrtime.bigint() - state.startedAt) / 1_000_000;
}

async function observeOperation<T>({
  fn,
  onStart,
  onFinish,
  options
}: {
  fn: () => Promise<T> | T;
  onStart?: () => void;
  onFinish: (status: ObservationStatus, result: T | undefined, state: ObservationState) => void;
  options?: ObserveMetricOptions<T>;
}): Promise<T> {
  const observationState = beginObservation();
  onStart?.();

  try {
    const result = await fn();
    const status = options?.getStatus?.(result) ?? 'ok';
    onFinish(status, result, observationState);
    return result;
  } catch (error) {
    onFinish('error', undefined, observationState);
    throw error;
  }
}

const meter = getMeter('fastgpt.workflow');
const prefix = 'fastgpt.workflow';

const runDuration = meter.createHistogram(`${prefix}.run.duration`, {
  description: 'Workflow run duration',
  unit: 'ms'
});
const runExecutions = meter.createCounter(`${prefix}.run.count`, {
  description: 'Workflow run count'
});
const runActive = meter.createUpDownCounter(`${prefix}.run.active`, {
  description: 'Workflow runs currently executing'
});
const runTimes = meter.createHistogram(`${prefix}.run.run_times`, {
  description: 'Workflow total run times before completion'
});
const stepDuration = meter.createHistogram(`${prefix}.step.duration`, {
  description: 'Workflow step execution duration',
  unit: 'ms'
});
const stepExecutions = meter.createCounter(`${prefix}.step.count`, {
  description: 'Workflow step execution count'
});

export async function observeWorkflowRun<T>(
  attributes: WorkflowRunMetricAttributes,
  fn: () => Promise<T> | T,
  options?: ObserveWorkflowRunOptions<T>
): Promise<T> {
  const baseAttributes = toRunMetricAttributes(attributes);

  return observeOperation({
    fn,
    options,
    onStart: () => {
      runActive.add(1, baseAttributes);
    },
    onFinish: (status, result, state) => {
      const metricAttributes = toRunMetricAttributes(attributes, { status });

      runDuration.record(getObservationDurationMs(state), metricAttributes);
      runExecutions.add(1, metricAttributes);

      const workflowRunTimes = result ? options?.getRunTimes?.(result) : undefined;
      if (typeof workflowRunTimes === 'number' && Number.isFinite(workflowRunTimes)) {
        runTimes.record(workflowRunTimes, metricAttributes);
      }

      runActive.add(-1, baseAttributes);
    }
  });
}

export async function observeWorkflowStep<T>(
  attributes: WorkflowStepMetricAttributes,
  fn: () => Promise<T> | T,
  options?: ObserveMetricOptions<T>
): Promise<T> {
  return observeOperation({
    fn,
    options,
    onFinish: (status, _result, state) => {
      const metricAttributes = toStepMetricAttributes(attributes, { status });

      stepDuration.record(getObservationDurationMs(state), metricAttributes);
      stepExecutions.add(1, metricAttributes);
    }
  });
}
