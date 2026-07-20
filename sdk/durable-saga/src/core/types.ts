import type { SerializedSagaError } from './error';

export type RuntimeSchema<T> = {
  parse(value: unknown): T;
};

export type SagaStatus = 'pending' | 'running' | 'waiting' | 'blocked' | 'completed' | 'failed';

export type SagaRetryPolicy = {
  maxAttempts: number;
  initialIntervalMs: number;
  backoffCoefficient?: number;
  maxIntervalMs?: number;
};

export type SagaCurrentStep = {
  stepId: string;
  phase: 'started' | 'uncertain';
  executeAttempts: number;
  reconcileAttempts: number;
  idempotencyKey: string;
  startedAt: Date;
  takeoverNotBefore: Date;
  lastError?: SerializedSagaError;
};

export type SagaExecution = {
  token: string;
  epoch: number;
  heartbeatAt: Date;
};

export type DurableSagaSnapshot = {
  sagaId: string;
  name: string;
  version: number;
  manifestSignature: string;
  inputHash: string;
  reservationKeys: string[];
  status: SagaStatus;
  input: unknown;
  state: unknown;
  nextStepIndex: number;
  executionEpoch: number;
  currentStep?: SagaCurrentStep;
  execution?: SagaExecution;
  nextRunAt?: Date;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  lastError?: SerializedSagaError;
};

export type SagaCandidate = {
  sagaId: string;
  revision: number;
  nextRunAt: Date;
};

export type SagaRuntimeEvent = {
  type:
    | 'started'
    | 'claimed'
    | 'stepStarted'
    | 'stepCompleted'
    | 'retryScheduled'
    | 'blocked'
    | 'completed'
    | 'failed'
    | 'executionLost'
    | 'wakeupFailed';
  sagaId: string;
  revision?: number;
  stepId?: string;
  error?: SerializedSagaError;
  occurredAt: Date;
};

export type SagaReconcileResult<Output> =
  | { type: 'applied'; output: Output }
  | { type: 'notApplied' }
  | { type: 'pending'; retryAfterMs: number };

export type SagaActivityRuntime<Input, State> = {
  sagaId: string;
  definitionVersion: number;
  executionEpoch: number;
  stepId: string;
  stepAttempt: number;
  idempotencyKey: string;
  input: Input;
  state: State;
  signal: AbortSignal;
  assertExecutionActive(): Promise<void>;
};

export type SagaProjectContext<TTransaction, Input, State, Output> = {
  transaction: TTransaction;
  sagaId: string;
  input: Input;
  previousState: State;
  state: State;
  output: Output;
};

export type SagaTerminalContext<TTransaction, Input, State> = {
  transaction: TTransaction;
  sagaId: string;
  input: Input;
  state: State;
  /** Stable runtime timestamp selected for this transaction callback attempt. */
  now: Date;
};
