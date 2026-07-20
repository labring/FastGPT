import type { SerializedSagaError } from '../core/error';
import type {
  DurableSagaSnapshot,
  SagaCandidate,
  SagaCurrentStep,
  SagaRuntimeEvent
} from '../core/types';

export type StartSagaCommand<TTransaction> = {
  snapshot: DurableSagaSnapshot;
  initialize(transaction: TTransaction): Promise<void>;
};

export type ClaimExecutionCommand = {
  sagaId: string;
  token: string;
  now: Date;
  staleBefore: Date;
  expectedRevision?: number;
};

export type ExecutionMutationCommand = {
  sagaId: string;
  executionToken: string;
  executionEpoch: number;
  expectedRevision: number;
  now: Date;
};

export type PersistStepAttemptCommand = ExecutionMutationCommand & {
  currentStep: SagaCurrentStep;
};

export type CommitStepCommand<TTransaction> = ExecutionMutationCommand & {
  nextState: unknown;
  nextStepIndex: number;
  stepId: string;
  project(transaction: TTransaction): Promise<void>;
};

export type ScheduleRetryCommand = ExecutionMutationCommand & {
  currentStep: SagaCurrentStep;
  nextRunAt: Date;
  error: SerializedSagaError;
};

export type BlockSagaCommand = ExecutionMutationCommand & {
  currentStep?: SagaCurrentStep;
  error: SerializedSagaError;
};

export type CompleteSagaCommand<TTransaction> = ExecutionMutationCommand & {
  complete(transaction: TTransaction): Promise<void>;
};

export type FailSagaCommand<TTransaction> = ExecutionMutationCommand & {
  error: SerializedSagaError;
  fail(transaction: TTransaction): Promise<void>;
};

export type ResolveBlockedCommand = {
  sagaId: string;
  expectedRevision: number;
  now: Date;
  clearCurrentStep: boolean;
};

export type FindDueCommand = {
  now: Date;
  staleBefore: Date;
  limit: number;
};

export type MutationResult = {
  snapshot: DurableSagaSnapshot;
};

/**
 * Authoritative persistence port contract.
 *
 * - `start` atomically creates the instance, all reservations, the start event and `initialize` work.
 * - Execution mutations accept only their documented active status and must fence by sagaId,
 *   executionToken, executionEpoch and expectedRevision before atomically incrementing revision.
 * - `commitStep` and terminal callbacks share the same database transaction as the Saga checkpoint.
 * - Terminal mutations release every reservation in that transaction.
 * - A transaction implementation may retry callbacks, so callbacks must contain database work only
 *   and must not perform network, queue or other non-transactional I/O.
 * - `heartbeat` does not change revision and returns whether the exact token+epoch still owns execution.
 * - `findDue` is an advisory scan; `claimExecution` is the final ownership decision.
 */
export type DurableSagaStore<TTransaction> = {
  start(command: StartSagaCommand<TTransaction>): Promise<MutationResult & { created: boolean }>;
  load(sagaId: string): Promise<DurableSagaSnapshot | null>;
  claimExecution(command: ClaimExecutionCommand): Promise<MutationResult | null>;
  persistStepAttempt(command: PersistStepAttemptCommand): Promise<MutationResult | null>;
  commitStep(command: CommitStepCommand<TTransaction>): Promise<MutationResult | null>;
  scheduleRetry(command: ScheduleRetryCommand): Promise<MutationResult | null>;
  yieldExecution(command: ExecutionMutationCommand): Promise<MutationResult | null>;
  block(command: BlockSagaCommand): Promise<MutationResult | null>;
  heartbeat(command: {
    sagaId: string;
    executionToken: string;
    executionEpoch: number;
    now: Date;
  }): Promise<boolean>;
  complete(command: CompleteSagaCommand<TTransaction>): Promise<MutationResult | null>;
  fail(command: FailSagaCommand<TTransaction>): Promise<MutationResult | null>;
  resolveBlocked(command: ResolveBlockedCommand): Promise<MutationResult | null>;
  findDue(command: FindDueCommand): Promise<readonly SagaCandidate[]>;
};

export type ExecutionLease = {
  signal: AbortSignal;
  assertValid(): Promise<void>;
};

export type LeaseProvider = {
  withLeases<T>(keys: readonly string[], run: (lease: ExecutionLease) => Promise<T>): Promise<T>;
};

export type WakeupScheduler = {
  schedule(params: { sagaId: string; expectedRevision: number; runAt: Date }): Promise<void>;
};

export type SagaClock = {
  now(): Date;
  sleep(ms: number, signal?: AbortSignal): Promise<void>;
};

export type SagaIdGenerator = {
  nextId(): string;
};

export type SagaValueHasher = {
  hash(value: unknown): Promise<string>;
};

export type SagaObserver = {
  onEvent(event: SagaRuntimeEvent): void | Promise<void>;
};
