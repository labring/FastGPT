import type { AnyBoundSaga, AnySagaStep, BoundSaga } from '../core/definition';
import {
  DurableSagaError,
  SagaBlockedError,
  SagaConflictError,
  SagaDefinitionError,
  SagaExecutionLostError,
  SagaNonRetryableError,
  SagaNotFoundError,
  serializeSagaError
} from '../core/error';
import type { SagaRegistry } from '../core/registry';
import { assertSagaSnapshot, calculateRetryDelay, terminalSagaStatuses } from '../core/state';
import type {
  DurableSagaSnapshot,
  SagaActivityRuntime,
  SagaCurrentStep,
  SagaReconcileResult,
  SagaRuntimeEvent
} from '../core/types';
import {
  assertLeaseSignal,
  defaultSagaValueHasher,
  passiveLeaseProvider,
  systemSagaClock,
  systemSagaIdGenerator
} from './defaults';
import type {
  DurableSagaStore,
  ExecutionLease,
  LeaseProvider,
  SagaClock,
  SagaIdGenerator,
  SagaObserver,
  SagaValueHasher,
  WakeupScheduler
} from './ports';

export type SagaRunResult =
  | { type: 'completed'; snapshot: DurableSagaSnapshot }
  | { type: 'scheduled'; snapshot: DurableSagaSnapshot }
  | { type: 'blocked'; snapshot: DurableSagaSnapshot }
  | { type: 'terminal'; snapshot: DurableSagaSnapshot }
  | { type: 'notFound' }
  | { type: 'notDue'; snapshot: DurableSagaSnapshot }
  | { type: 'busy'; snapshot: DurableSagaSnapshot }
  | { type: 'staleWakeup'; snapshot: DurableSagaSnapshot }
  | { type: 'definitionUnavailable'; snapshot: DurableSagaSnapshot }
  | {
      type: 'invalidSnapshot';
      snapshot: DurableSagaSnapshot;
      error: ReturnType<typeof serializeSagaError>;
    };

export type DurableSagaEngine<TTransaction> = {
  start<Input, State>(
    definition: BoundSaga<Input, State, TTransaction>,
    params: { sagaId: string; input: Input; run?: boolean }
  ): Promise<{ snapshot: DurableSagaSnapshot; created: boolean; runResult?: SagaRunResult }>;
  get(sagaId: string): Promise<DurableSagaSnapshot | null>;
  run(sagaId: string, options?: { expectedRevision?: number }): Promise<SagaRunResult>;
  resolveBlocked(
    sagaId: string,
    options: {
      expectedRevision: number;
      resolution: { type: 'retryReconcile' } | { type: 'confirmNotApplied' };
      run?: boolean;
    }
  ): Promise<DurableSagaSnapshot>;
  recoverDue(options?: { limit?: number; concurrency?: number }): Promise<number>;
};

export type DurableSagaEngineOptions<TTransaction> = {
  store: DurableSagaStore<TTransaction>;
  registry: SagaRegistry<TTransaction>;
  leaseProvider?: LeaseProvider;
  wakeupScheduler?: WakeupScheduler;
  clock?: SagaClock;
  idGenerator?: SagaIdGenerator;
  valueHasher?: SagaValueHasher;
  observer?: SagaObserver;
  heartbeatIntervalMs?: number;
  executionStaleMs?: number;
  maxStepsPerRun?: number;
};

const addMs = (date: Date, ms: number) => new Date(date.getTime() + ms);

/** Creates a durable Saga engine. Mongo/Redis/BullMQ behavior is supplied only through ports. */
export const createSagaEngine = <TTransaction>(
  options: DurableSagaEngineOptions<TTransaction>
): DurableSagaEngine<TTransaction> => {
  const {
    store,
    registry,
    leaseProvider = passiveLeaseProvider,
    wakeupScheduler,
    clock = systemSagaClock,
    idGenerator = systemSagaIdGenerator,
    valueHasher = defaultSagaValueHasher,
    observer,
    heartbeatIntervalMs = 15_000,
    executionStaleMs = 60_000,
    maxStepsPerRun = 100
  } = options;

  if (!registry.isSealed()) {
    throw new SagaDefinitionError('Saga registry must be sealed before creating an engine');
  }
  if (heartbeatIntervalMs <= 0 || executionStaleMs <= heartbeatIntervalMs) {
    throw new SagaDefinitionError('executionStaleMs must be greater than heartbeatIntervalMs');
  }

  const observe = async (event: SagaRuntimeEvent) => {
    try {
      await observer?.onEvent(event);
    } catch {
      // Observability is deliberately outside the durable commit path.
    }
  };

  const schedule = async (snapshot: DurableSagaSnapshot) => {
    if (
      !wakeupScheduler ||
      terminalSagaStatuses.has(snapshot.status) ||
      snapshot.status === 'blocked'
    ) {
      return;
    }
    const runAt = snapshot.nextRunAt ?? clock.now();
    try {
      await wakeupScheduler.schedule({
        sagaId: snapshot.sagaId,
        expectedRevision: snapshot.revision,
        runAt
      });
    } catch (error) {
      await observe({
        type: 'wakeupFailed',
        sagaId: snapshot.sagaId,
        revision: snapshot.revision,
        error: serializeSagaError(error),
        occurredAt: clock.now()
      });
    }
  };

  const getDefinition = (snapshot: DurableSagaSnapshot): AnyBoundSaga<TTransaction> | undefined => {
    const definition = registry.get(snapshot.name, snapshot.version);
    if (!definition || definition.manifestSignature !== snapshot.manifestSignature)
      return undefined;
    return definition;
  };

  const hydrateSnapshot = (
    snapshot: DurableSagaSnapshot,
    definition: AnyBoundSaga<TTransaction>
  ): DurableSagaSnapshot => ({
    ...snapshot,
    input: definition.input.parse(snapshot.input),
    state: definition.state.parse(snapshot.state)
  });

  const requireMutation = <T extends { snapshot: DurableSagaSnapshot }>(
    sagaId: string,
    result: T | null
  ): T => {
    if (!result) throw new SagaExecutionLostError(sagaId);
    assertSagaSnapshot(result.snapshot);
    return result;
  };

  const createRuntime = (params: {
    snapshot: DurableSagaSnapshot;
    step: AnySagaStep<TTransaction>;
    lease: ExecutionLease;
    controller: AbortController;
  }): SagaActivityRuntime<unknown, unknown> => {
    const { snapshot, step, lease, controller } = params;
    const execution = snapshot.execution;
    const currentStep = snapshot.currentStep;
    if (!execution || !currentStep) throw new SagaExecutionLostError(snapshot.sagaId);

    const assertExecutionActive = async () => {
      assertLeaseSignal(snapshot.sagaId, lease);
      await lease.assertValid();
      const active = await store.heartbeat({
        sagaId: snapshot.sagaId,
        executionToken: execution.token,
        executionEpoch: execution.epoch,
        now: clock.now()
      });
      if (!active) {
        controller.abort(new SagaExecutionLostError(snapshot.sagaId));
        throw new SagaExecutionLostError(snapshot.sagaId);
      }
    };

    return {
      sagaId: snapshot.sagaId,
      definitionVersion: snapshot.version,
      executionEpoch: execution.epoch,
      stepId: step.id,
      stepAttempt: currentStep.executeAttempts,
      idempotencyKey: currentStep.idempotencyKey,
      input: snapshot.input,
      state: snapshot.state,
      signal: controller.signal,
      assertExecutionActive
    };
  };

  const runActivity = async <T>(params: {
    snapshot: DurableSagaSnapshot;
    step: AnySagaStep<TTransaction>;
    lease: ExecutionLease;
    activity(runtime: SagaActivityRuntime<unknown, unknown>): Promise<T>;
  }): Promise<T> => {
    const controller = new AbortController();
    const abortFromLease = () => controller.abort(params.lease.signal.reason);
    if (params.lease.signal.aborted) abortFromLease();
    else params.lease.signal.addEventListener('abort', abortFromLease, { once: true });
    const runtime = createRuntime({ ...params, controller });
    await runtime.assertExecutionActive();

    let heartbeatStopped = false;
    const heartbeatLoop = (async () => {
      while (!heartbeatStopped && !controller.signal.aborted) {
        try {
          await clock.sleep(heartbeatIntervalMs, controller.signal);
          if (!heartbeatStopped) await runtime.assertExecutionActive();
        } catch (error) {
          if (!heartbeatStopped) controller.abort(error);
          return;
        }
      }
    })();

    const activityPromise = params.activity(runtime);
    activityPromise.catch(() => undefined);
    const timeoutPromise = clock.sleep(params.step.timeoutMs, controller.signal).then(() => {
      const error = new DurableSagaError(`Step "${params.step.id}" timed out`, {
        code: 'SAGA_STEP_TIMEOUT'
      });
      controller.abort(error);
      throw error;
    });
    timeoutPromise.catch(() => undefined);

    try {
      return await Promise.race([activityPromise, timeoutPromise]);
    } finally {
      heartbeatStopped = true;
      controller.abort();
      await heartbeatLoop;
      params.lease.signal.removeEventListener('abort', abortFromLease);
    }
  };

  const persistAttempt = async (params: {
    snapshot: DurableSagaSnapshot;
    step: AnySagaStep<TTransaction>;
    kind: 'execute' | 'reconcile';
  }) => {
    const { snapshot, step, kind } = params;
    const execution = snapshot.execution;
    if (!execution) throw new SagaExecutionLostError(snapshot.sagaId);
    const now = clock.now();
    const existing = snapshot.currentStep;
    const isolationMs = step.effect.type === 'reconcileRequired' ? step.effect.isolationMs : 0;
    const currentStep: SagaCurrentStep = {
      stepId: step.id,
      phase: 'started',
      executeAttempts: (existing?.executeAttempts ?? 0) + (kind === 'execute' ? 1 : 0),
      reconcileAttempts: (existing?.reconcileAttempts ?? 0) + (kind === 'reconcile' ? 1 : 0),
      idempotencyKey:
        existing?.idempotencyKey ??
        (await valueHasher.hash({
          sagaId: snapshot.sagaId,
          stepId: step.id,
          direction: 'forward'
        })),
      startedAt: existing?.startedAt ?? now,
      takeoverNotBefore:
        kind === 'execute' ? addMs(now, isolationMs) : (existing?.takeoverNotBefore ?? now),
      lastError: existing?.lastError
    };
    return requireMutation(
      snapshot.sagaId,
      await store.persistStepAttempt({
        sagaId: snapshot.sagaId,
        executionToken: execution.token,
        executionEpoch: execution.epoch,
        expectedRevision: snapshot.revision,
        now,
        currentStep
      })
    ).snapshot;
  };

  const commitOutput = async (params: {
    snapshot: DurableSagaSnapshot;
    definition: AnyBoundSaga<TTransaction>;
    step: AnySagaStep<TTransaction>;
    output: unknown;
  }) => {
    const { snapshot, definition, step } = params;
    const execution = snapshot.execution;
    if (!execution) throw new SagaExecutionLostError(snapshot.sagaId);
    let output: unknown;
    let nextState: unknown;
    try {
      output = step.output.parse(params.output);
      nextState = definition.state.parse(
        step.apply({ input: snapshot.input, state: snapshot.state, output })
      );
    } catch (error) {
      throw new SagaDefinitionError(`Step "${step.id}" output or next state is invalid`, {
        error: serializeSagaError(error)
      });
    }
    const result = requireMutation(
      snapshot.sagaId,
      await store.commitStep({
        sagaId: snapshot.sagaId,
        executionToken: execution.token,
        executionEpoch: execution.epoch,
        expectedRevision: snapshot.revision,
        now: clock.now(),
        nextState,
        nextStepIndex: snapshot.nextStepIndex + 1,
        stepId: step.id,
        project: async (transaction) => {
          await step.project?.({
            transaction,
            sagaId: snapshot.sagaId,
            input: snapshot.input,
            previousState: snapshot.state,
            state: nextState,
            output
          });
        }
      })
    );
    await observe({
      type: 'stepCompleted',
      sagaId: snapshot.sagaId,
      revision: result.snapshot.revision,
      stepId: step.id,
      occurredAt: clock.now()
    });
    return result.snapshot;
  };

  const commitOutputOrBlock = async (params: {
    snapshot: DurableSagaSnapshot;
    definition: AnyBoundSaga<TTransaction>;
    step: AnySagaStep<TTransaction>;
    output: unknown;
  }): Promise<DurableSagaSnapshot | SagaRunResult> => {
    try {
      return await commitOutput(params);
    } catch (error) {
      if (error instanceof SagaDefinitionError) return block({ ...params, error });
      // A driver/project failure leaves the persisted attempt uncertain. Recovery must reconcile it
      // instead of immediately replaying the remote Activity in this execution.
      throw error;
    }
  };

  const scheduleRetry = async (params: {
    snapshot: DurableSagaSnapshot;
    step: AnySagaStep<TTransaction>;
    error: unknown;
    delayMs?: number;
    extendIsolation?: boolean;
  }): Promise<SagaRunResult> => {
    const { snapshot, step, error } = params;
    const execution = snapshot.execution;
    const currentStep = snapshot.currentStep;
    if (!execution || !currentStep) throw new SagaExecutionLostError(snapshot.sagaId);
    const serializedError = serializeSagaError(error);
    const attempt = Math.max(currentStep.executeAttempts, currentStep.reconcileAttempts);
    const delayMs = params.delayMs ?? calculateRetryDelay(attempt, step.retry);
    const result = requireMutation(
      snapshot.sagaId,
      await store.scheduleRetry({
        sagaId: snapshot.sagaId,
        executionToken: execution.token,
        executionEpoch: execution.epoch,
        expectedRevision: snapshot.revision,
        now: clock.now(),
        currentStep: {
          ...currentStep,
          phase: 'uncertain',
          takeoverNotBefore:
            step.effect.type === 'reconcileRequired' && params.extendIsolation
              ? new Date(
                  Math.max(
                    currentStep.takeoverNotBefore.getTime(),
                    addMs(clock.now(), step.effect.isolationMs).getTime()
                  )
                )
              : currentStep.takeoverNotBefore,
          lastError: serializedError
        },
        nextRunAt: addMs(clock.now(), delayMs),
        error: serializedError
      })
    );
    await observe({
      type: 'retryScheduled',
      sagaId: snapshot.sagaId,
      revision: result.snapshot.revision,
      stepId: step.id,
      error: serializedError,
      occurredAt: clock.now()
    });
    await schedule(result.snapshot);
    return { type: 'scheduled', snapshot: result.snapshot };
  };

  const block = async (params: {
    snapshot: DurableSagaSnapshot;
    step?: AnySagaStep<TTransaction>;
    error: unknown;
  }): Promise<SagaRunResult> => {
    const execution = params.snapshot.execution;
    if (!execution) throw new SagaExecutionLostError(params.snapshot.sagaId);
    const serializedError = serializeSagaError(params.error);
    const result = requireMutation(
      params.snapshot.sagaId,
      await store.block({
        sagaId: params.snapshot.sagaId,
        executionToken: execution.token,
        executionEpoch: execution.epoch,
        expectedRevision: params.snapshot.revision,
        now: clock.now(),
        currentStep: params.snapshot.currentStep,
        error: serializedError
      })
    );
    await observe({
      type: 'blocked',
      sagaId: params.snapshot.sagaId,
      revision: result.snapshot.revision,
      stepId: params.step?.id,
      error: serializedError,
      occurredAt: clock.now()
    });
    return { type: 'blocked', snapshot: result.snapshot };
  };

  const failOrBlock = async (params: {
    snapshot: DurableSagaSnapshot;
    definition: AnyBoundSaga<TTransaction>;
    step: AnySagaStep<TTransaction>;
    error: unknown;
  }): Promise<SagaRunResult> => {
    if (!params.definition.binding.onFailure) return block(params);
    const execution = params.snapshot.execution;
    if (!execution) throw new SagaExecutionLostError(params.snapshot.sagaId);
    const serializedError = serializeSagaError(params.error);
    const result = requireMutation(
      params.snapshot.sagaId,
      await store.fail({
        sagaId: params.snapshot.sagaId,
        executionToken: execution.token,
        executionEpoch: execution.epoch,
        expectedRevision: params.snapshot.revision,
        now: clock.now(),
        error: serializedError,
        fail: async (transaction) => {
          await params.definition.binding.onFailure?.({
            transaction,
            sagaId: params.snapshot.sagaId,
            input: params.snapshot.input,
            state: params.snapshot.state,
            error: params.error,
            now: clock.now()
          });
        }
      })
    );
    await observe({
      type: 'failed',
      sagaId: params.snapshot.sagaId,
      revision: result.snapshot.revision,
      stepId: params.step.id,
      error: serializedError,
      occurredAt: clock.now()
    });
    return { type: 'terminal', snapshot: result.snapshot };
  };

  const handleActivityError = async (params: {
    snapshot: DurableSagaSnapshot;
    definition: AnyBoundSaga<TTransaction>;
    step: AnySagaStep<TTransaction>;
    error: unknown;
  }): Promise<SagaRunResult> => {
    const { snapshot, step, error } = params;
    if (error instanceof SagaExecutionLostError) throw error;
    if (
      error instanceof SagaBlockedError ||
      error instanceof SagaDefinitionError ||
      step.effect.type === 'manual'
    )
      return block(params);

    const attempts = Math.max(
      snapshot.currentStep?.executeAttempts ?? 1,
      snapshot.currentStep?.reconcileAttempts ?? 0
    );
    const nonRetryable =
      error instanceof SagaNonRetryableError || error instanceof SagaConflictError;
    if (nonRetryable || attempts >= step.retry.maxAttempts) return failOrBlock(params);
    return scheduleRetry({ ...params, extendIsolation: true });
  };

  const executeStep = async (params: {
    snapshot: DurableSagaSnapshot;
    definition: AnyBoundSaga<TTransaction>;
    step: AnySagaStep<TTransaction>;
    lease: ExecutionLease;
  }): Promise<DurableSagaSnapshot | SagaRunResult> => {
    const snapshot = await persistAttempt({
      snapshot: params.snapshot,
      step: params.step,
      kind: 'execute'
    });
    await observe({
      type: 'stepStarted',
      sagaId: snapshot.sagaId,
      revision: snapshot.revision,
      stepId: params.step.id,
      occurredAt: clock.now()
    });

    let output: unknown;
    try {
      output = await runActivity({
        snapshot,
        step: params.step,
        lease: params.lease,
        activity: (runtime) => params.step.execute(runtime)
      });
    } catch (error) {
      return handleActivityError({ ...params, snapshot, error });
    }
    return commitOutputOrBlock({ ...params, snapshot, output });
  };

  const recoverStep = async (params: {
    snapshot: DurableSagaSnapshot;
    definition: AnyBoundSaga<TTransaction>;
    step: AnySagaStep<TTransaction>;
    lease: ExecutionLease;
  }): Promise<DurableSagaSnapshot | SagaRunResult> => {
    const { snapshot, step } = params;
    const currentStep = snapshot.currentStep;
    if (!currentStep || currentStep.stepId !== step.id) {
      return block({
        ...params,
        error: new SagaDefinitionError(
          'Persisted current step does not match the definition cursor'
        )
      });
    }
    if (currentStep.takeoverNotBefore > clock.now()) {
      return scheduleRetry({
        snapshot,
        step,
        error: currentStep.lastError ?? new SagaExecutionLostError(snapshot.sagaId),
        delayMs: currentStep.takeoverNotBefore.getTime() - clock.now().getTime()
      });
    }
    if (step.effect.type === 'manual') {
      return block({
        ...params,
        error: new SagaBlockedError(`Step "${step.id}" has an uncertain manual side effect`)
      });
    }
    if (step.effect.type !== 'reconcileRequired') return executeStep(params);

    let reconciledSnapshot = await persistAttempt({ snapshot, step, kind: 'reconcile' });
    let result: SagaReconcileResult<unknown>;
    try {
      result = await runActivity({
        snapshot: reconciledSnapshot,
        step,
        lease: params.lease,
        activity: (runtime) =>
          step.effect.type === 'reconcileRequired'
            ? step.effect.reconcile(runtime)
            : Promise.reject(new SagaDefinitionError('Invalid reconcile policy'))
      });
    } catch (error) {
      return handleActivityError({ ...params, snapshot: reconciledSnapshot, error });
    }
    if (result.type === 'applied') {
      return commitOutputOrBlock({
        ...params,
        snapshot: reconciledSnapshot,
        output: result.output
      });
    }
    if (result.type === 'pending') {
      return scheduleRetry({
        snapshot: reconciledSnapshot,
        step,
        error: new SagaExecutionLostError(snapshot.sagaId),
        delayMs: result.retryAfterMs
      });
    }
    reconciledSnapshot = await persistAttempt({
      snapshot: reconciledSnapshot,
      step,
      kind: 'execute'
    });
    let output: unknown;
    try {
      output = await runActivity({
        snapshot: reconciledSnapshot,
        step,
        lease: params.lease,
        activity: (runtime) => step.execute(runtime)
      });
    } catch (error) {
      return handleActivityError({ ...params, snapshot: reconciledSnapshot, error });
    }
    return commitOutputOrBlock({ ...params, snapshot: reconciledSnapshot, output });
  };

  const complete = async (
    snapshot: DurableSagaSnapshot,
    definition: AnyBoundSaga<TTransaction>
  ): Promise<SagaRunResult> => {
    const execution = snapshot.execution;
    if (!execution) throw new SagaExecutionLostError(snapshot.sagaId);
    const result = requireMutation(
      snapshot.sagaId,
      await store.complete({
        sagaId: snapshot.sagaId,
        executionToken: execution.token,
        executionEpoch: execution.epoch,
        expectedRevision: snapshot.revision,
        now: clock.now(),
        complete: async (transaction) => {
          await definition.binding.onComplete?.({
            transaction,
            sagaId: snapshot.sagaId,
            input: snapshot.input,
            state: snapshot.state,
            now: clock.now()
          });
        }
      })
    );
    await observe({
      type: 'completed',
      sagaId: snapshot.sagaId,
      revision: result.snapshot.revision,
      occurredAt: clock.now()
    });
    return { type: 'completed', snapshot: result.snapshot };
  };

  const runClaimed = async (
    initialSnapshot: DurableSagaSnapshot,
    definition: AnyBoundSaga<TTransaction>,
    lease: ExecutionLease
  ): Promise<SagaRunResult> => {
    let snapshot = initialSnapshot;

    for (let completedInSlice = 0; completedInSlice < maxStepsPerRun; completedInSlice++) {
      if (snapshot.nextStepIndex >= definition.steps.length) {
        try {
          return await complete(snapshot, definition);
        } catch (error) {
          if (
            error instanceof SagaConflictError ||
            error instanceof SagaDefinitionError ||
            error instanceof SagaNonRetryableError
          ) {
            return block({ snapshot, error });
          }
          throw error;
        }
      }
      const step = definition.steps[snapshot.nextStepIndex];
      if (!step) {
        return block({ snapshot, error: new SagaDefinitionError('Saga cursor is out of bounds') });
      }

      if (
        !snapshot.currentStep &&
        step.when &&
        !step.when({
          input: snapshot.input,
          state: snapshot.state
        })
      ) {
        const execution = snapshot.execution;
        if (!execution) throw new SagaExecutionLostError(snapshot.sagaId);
        snapshot = requireMutation(
          snapshot.sagaId,
          await store.commitStep({
            sagaId: snapshot.sagaId,
            executionToken: execution.token,
            executionEpoch: execution.epoch,
            expectedRevision: snapshot.revision,
            now: clock.now(),
            nextState: snapshot.state,
            nextStepIndex: snapshot.nextStepIndex + 1,
            stepId: step.id,
            async project() {}
          })
        ).snapshot;
        continue;
      }

      const result = snapshot.currentStep
        ? await recoverStep({ snapshot, definition, step, lease })
        : await executeStep({ snapshot, definition, step, lease });
      if ('type' in result) return result;
      snapshot = result;
    }

    const execution = snapshot.execution;
    if (!execution) throw new SagaExecutionLostError(snapshot.sagaId);
    const yielded = requireMutation(
      snapshot.sagaId,
      await store.yieldExecution({
        sagaId: snapshot.sagaId,
        executionToken: execution.token,
        executionEpoch: execution.epoch,
        expectedRevision: snapshot.revision,
        now: clock.now()
      })
    ).snapshot;
    await schedule(yielded);
    return { type: 'scheduled', snapshot: yielded };
  };

  const engine: DurableSagaEngine<TTransaction> = {
    async start(definition, params) {
      const registered = registry.get(definition.name, definition.version);
      if (!registered || registered.manifestSignature !== definition.manifestSignature) {
        throw new SagaDefinitionError(
          `Saga definition "${definition.name}@${definition.version}" is not registered`
        );
      }
      // Only the registry-owned canonical object may execute callbacks. A same-manifest lookalike
      // must never initialize data that will later be recovered with different code.
      const canonical = registered as unknown as typeof definition;
      const input = canonical.input.parse(params.input);
      const state = canonical.state.parse(canonical.initialState(input));
      const reservationKeys = [...new Set(canonical.reservationKeys(input))].sort();
      if (reservationKeys.some((key) => key.trim().length === 0)) {
        throw new SagaDefinitionError('Saga reservation keys cannot be empty');
      }
      const now = clock.now();
      const inputHash = await valueHasher.hash(input);
      const initializationLeaseKeys = [...new Set(canonical.initializationLeaseKeys(input))].sort();
      const result = await leaseProvider.withLeases(initializationLeaseKeys, async (lease) => {
        assertLeaseSignal(params.sagaId, lease);
        await lease.assertValid();
        const started = await store.start({
          snapshot: {
            sagaId: params.sagaId,
            name: canonical.name,
            version: canonical.version,
            manifestSignature: canonical.manifestSignature,
            inputHash,
            reservationKeys,
            status: 'pending',
            input,
            state,
            nextStepIndex: 0,
            executionEpoch: 0,
            nextRunAt: now,
            revision: 0,
            createdAt: now,
            updatedAt: now
          },
          initialize: async (transaction) => {
            await canonical.binding.initialize?.({
              transaction,
              sagaId: params.sagaId,
              input,
              state,
              now
            });
          }
        });
        await lease.assertValid();
        return started;
      });
      if (
        result.snapshot.inputHash !== inputHash ||
        result.snapshot.manifestSignature !== canonical.manifestSignature
      ) {
        throw new SagaConflictError(
          `Saga id "${params.sagaId}" was already used with different input`
        );
      }
      assertSagaSnapshot(result.snapshot);
      if (result.created) {
        await observe({
          type: 'started',
          sagaId: params.sagaId,
          revision: result.snapshot.revision,
          occurredAt: now
        });
        await schedule(result.snapshot);
      }
      const runResult = params.run ? await engine.run(params.sagaId) : undefined;
      return { ...result, runResult };
    },

    async get(sagaId) {
      const snapshot = await store.load(sagaId);
      if (snapshot) assertSagaSnapshot(snapshot);
      return snapshot;
    },

    async run(sagaId, runOptions) {
      const loaded = await store.load(sagaId);
      if (!loaded) return { type: 'notFound' };
      assertSagaSnapshot(loaded);
      if (
        runOptions?.expectedRevision !== undefined &&
        loaded.revision !== runOptions.expectedRevision
      ) {
        return { type: 'staleWakeup', snapshot: loaded };
      }
      if (terminalSagaStatuses.has(loaded.status)) return { type: 'terminal', snapshot: loaded };
      if (loaded.status === 'blocked') return { type: 'blocked', snapshot: loaded };
      if (loaded.status === 'waiting' && loaded.nextRunAt && loaded.nextRunAt > clock.now()) {
        return { type: 'notDue', snapshot: loaded };
      }
      const definition = getDefinition(loaded);
      if (!definition) return { type: 'definitionUnavailable', snapshot: loaded };

      let hydrated: DurableSagaSnapshot;
      try {
        hydrated = hydrateSnapshot(loaded, definition);
      } catch (error) {
        return { type: 'invalidSnapshot', snapshot: loaded, error: serializeSagaError(error) };
      }
      const executionLeaseKeys = [...new Set(definition.executionLeaseKeys(hydrated.input))].sort();

      return leaseProvider.withLeases(executionLeaseKeys, async (lease) => {
        assertLeaseSignal(sagaId, lease);
        await lease.assertValid();
        const claim = await store.claimExecution({
          sagaId,
          token: idGenerator.nextId(),
          now: clock.now(),
          staleBefore: addMs(clock.now(), -executionStaleMs),
          expectedRevision: runOptions?.expectedRevision
        });
        if (!claim) {
          const current = (await store.load(sagaId)) ?? loaded;
          return { type: 'busy', snapshot: current };
        }
        assertSagaSnapshot(claim.snapshot);
        let claimedSnapshot: DurableSagaSnapshot;
        try {
          claimedSnapshot = hydrateSnapshot(claim.snapshot, definition);
        } catch (error) {
          return block({
            snapshot: claim.snapshot,
            error: new SagaDefinitionError(
              'Persisted Saga input or state failed schema validation',
              {
                error: serializeSagaError(error)
              }
            )
          });
        }
        await observe({
          type: 'claimed',
          sagaId,
          revision: claim.snapshot.revision,
          occurredAt: clock.now()
        });
        try {
          return await runClaimed(claimedSnapshot, definition, lease);
        } catch (error) {
          if (error instanceof SagaExecutionLostError) {
            await observe({
              type: 'executionLost',
              sagaId,
              error: serializeSagaError(error),
              occurredAt: clock.now()
            });
            const current = (await store.load(sagaId)) ?? claim.snapshot;
            return { type: 'busy', snapshot: current };
          }
          throw error;
        }
      });
    },

    async resolveBlocked(sagaId, resolveOptions) {
      const current = await store.load(sagaId);
      if (!current) throw new SagaNotFoundError(sagaId);
      if (current.status !== 'blocked') {
        throw new SagaConflictError(`Saga "${sagaId}" is not blocked`);
      }
      if (current.revision !== resolveOptions.expectedRevision) {
        throw new SagaConflictError(`Saga "${sagaId}" changed before operator resolution`);
      }
      if (resolveOptions.resolution.type === 'confirmNotApplied' && !current.currentStep) {
        throw new SagaConflictError('confirmNotApplied requires an uncertain current step');
      }
      const result = await store.resolveBlocked({
        sagaId,
        expectedRevision: resolveOptions.expectedRevision,
        now: clock.now(),
        clearCurrentStep: resolveOptions.resolution.type === 'confirmNotApplied'
      });
      if (!result) throw new SagaConflictError(`Saga "${sagaId}" changed during resolution`);
      await schedule(result.snapshot);
      if (resolveOptions.run) await engine.run(sagaId);
      return result.snapshot;
    },

    async recoverDue(recoverOptions) {
      const limit = recoverOptions?.limit ?? 100;
      const concurrency = Math.max(1, recoverOptions?.concurrency ?? 10);
      const candidates = await store.findDue({
        now: clock.now(),
        staleBefore: addMs(clock.now(), -executionStaleMs),
        limit
      });
      let cursor = 0;
      const workers = Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
        while (cursor < candidates.length) {
          const candidate = candidates[cursor++];
          if (!candidate) return;
          await engine.run(candidate.sagaId, { expectedRevision: candidate.revision });
        }
      });
      await Promise.all(workers);
      return candidates.length;
    }
  };

  return engine;
};
