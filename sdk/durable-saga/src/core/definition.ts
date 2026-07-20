import { SagaDefinitionError } from './error';
import type {
  RuntimeSchema,
  SagaActivityRuntime,
  SagaProjectContext,
  SagaReconcileResult,
  SagaRetryPolicy,
  SagaTerminalContext
} from './types';

export type SagaEffectPolicy<Input, State, Output> =
  | { type: 'idempotent' }
  | {
      type: 'reconcileRequired';
      isolationMs: number;
      reconcile(runtime: SagaActivityRuntime<Input, State>): Promise<SagaReconcileResult<Output>>;
    }
  | { type: 'manual' };

export type SagaStep<Input, State, Output, TTransaction> = {
  id: string;
  output: RuntimeSchema<Output>;
  effect: SagaEffectPolicy<Input, State, Output>;
  retry: SagaRetryPolicy;
  timeoutMs: number;
  when?: (context: { input: Input; state: State }) => boolean;
  execute(runtime: SagaActivityRuntime<Input, State>): Promise<Output>;
  apply(context: { input: Input; state: State; output: Output }): State;
  project?(context: SagaProjectContext<TTransaction, Input, State, Output>): Promise<void>;
};

export type SagaDefinition<Input, State, TTransaction> = {
  name: string;
  version: number;
  input: RuntimeSchema<Input>;
  state: RuntimeSchema<State>;
  initialState(input: Input): State;
  reservationKeys(input: Input): readonly string[];
  initializationLeaseKeys(input: Input): readonly string[];
  executionLeaseKeys(input: Input): readonly string[];
  steps: readonly SagaStep<Input, State, unknown, TTransaction>[];
  manifestSignature: string;
};

export type SagaBinding<Input, State, TTransaction> = {
  initialize?(context: SagaTerminalContext<TTransaction, Input, State>): Promise<void>;
  onComplete?(context: SagaTerminalContext<TTransaction, Input, State>): Promise<void>;
  onFailure?(
    context: SagaTerminalContext<TTransaction, Input, State> & { error: unknown }
  ): Promise<void>;
};

export type BoundSaga<Input, State, TTransaction> = SagaDefinition<Input, State, TTransaction> & {
  binding: SagaBinding<Input, State, TTransaction>;
};

const normalizeRetry = (retry: SagaRetryPolicy) => ({
  maxAttempts: retry.maxAttempts,
  initialIntervalMs: retry.initialIntervalMs,
  backoffCoefficient: retry.backoffCoefficient ?? 2,
  maxIntervalMs: retry.maxIntervalMs ?? null
});

const buildManifestSignature = <Input, State, TTransaction>(params: {
  name: string;
  version: number;
  steps: readonly SagaStep<Input, State, unknown, TTransaction>[];
}) =>
  `durable-saga-v1:${JSON.stringify({
    name: params.name,
    version: params.version,
    steps: params.steps.map((step) => ({
      id: step.id,
      effect: step.effect.type,
      isolationMs: step.effect.type === 'reconcileRequired' ? step.effect.isolationMs : null,
      timeoutMs: step.timeoutMs,
      retry: normalizeRetry(step.retry)
    }))
  })}`;

/** Defines a versioned linear Saga and validates invariants that must be stable across deployments. */
export const defineSaga = <Input, State, TTransaction = never>(params: {
  name: string;
  version: number;
  input: RuntimeSchema<Input>;
  state: RuntimeSchema<State>;
  initialState(input: Input): State;
  reservationKeys(input: Input): readonly string[];
  /** Advisory leases held while the transactional initialize callback runs. */
  initializationLeaseKeys?(input: Input): readonly string[];
  /** Advisory leases held only for an execution slice, never while waiting or blocked. */
  executionLeaseKeys?(input: Input): readonly string[];
  steps: readonly SagaStep<Input, State, unknown, TTransaction>[];
}): SagaDefinition<Input, State, TTransaction> => {
  if (params.name.trim().length === 0) {
    throw new SagaDefinitionError('Saga name cannot be empty');
  }
  if (!Number.isSafeInteger(params.version) || params.version < 1) {
    throw new SagaDefinitionError('Saga version must be a positive safe integer');
  }
  if (params.steps.length === 0) {
    throw new SagaDefinitionError('Saga must define at least one step');
  }

  const stepIds = new Set<string>();
  for (const step of params.steps) {
    if (step.id.trim().length === 0 || stepIds.has(step.id)) {
      throw new SagaDefinitionError(`Saga step id "${step.id}" must be non-empty and unique`);
    }
    if (!Number.isSafeInteger(step.retry.maxAttempts) || step.retry.maxAttempts < 1) {
      throw new SagaDefinitionError(`Step "${step.id}" maxAttempts must be a positive integer`);
    }
    if (step.retry.initialIntervalMs < 0 || step.timeoutMs <= 0) {
      throw new SagaDefinitionError(`Step "${step.id}" has an invalid retry interval or timeout`);
    }
    if (step.effect.type === 'reconcileRequired' && step.effect.isolationMs < 0) {
      throw new SagaDefinitionError(`Step "${step.id}" isolationMs cannot be negative`);
    }
    stepIds.add(step.id);
  }

  const steps = Object.freeze([...params.steps]);
  return Object.freeze({
    ...params,
    initializationLeaseKeys: params.initializationLeaseKeys ?? params.reservationKeys,
    executionLeaseKeys: params.executionLeaseKeys ?? params.reservationKeys,
    steps,
    manifestSignature: buildManifestSignature(params)
  });
};

/** Defines one Saga step while retaining Input, State, Output and transaction inference. */
export const defineStep = <Input, State, Output, TTransaction = never>(
  step: SagaStep<Input, State, Output, TTransaction>
): SagaStep<Input, State, Output, TTransaction> =>
  Object.freeze({
    ...step,
    retry: Object.freeze({ ...step.retry }),
    effect: Object.freeze({ ...step.effect })
  });

/** Adds transactional domain hooks without coupling the portable definition to a database adapter. */
export const bindSaga = <Input, State, TTransaction>(
  definition: SagaDefinition<Input, State, TTransaction>,
  binding: SagaBinding<Input, State, TTransaction>
): BoundSaga<Input, State, TTransaction> =>
  Object.freeze({ ...definition, binding: Object.freeze({ ...binding }) });

export type AnyBoundSaga<TTransaction> = BoundSaga<unknown, unknown, TTransaction>;
export type AnySagaStep<TTransaction> = SagaStep<unknown, unknown, unknown, TTransaction>;
