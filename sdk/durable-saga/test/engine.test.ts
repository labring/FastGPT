import { describe, expect, it } from 'vitest';
import {
  SagaConflictError,
  SagaNonRetryableError,
  bindSaga,
  createSagaEngine,
  createSagaRegistry,
  defineSaga,
  defineStep
} from '../src';
import { createMemorySagaDriver } from './support';
import {
  createTestDefinition,
  createTestRuntime,
  defaultRetry,
  schema,
  type TestDomain,
  type TestInput,
  type TestState,
  type TestTransaction
} from './helpers';

describe('DurableSagaEngine.start', () => {
  it('is idempotent for equal input and rejects a reused id with different input', async () => {
    const { engine, definition, driver } = createTestRuntime();

    const first = await engine.start(definition, { sagaId: 'same', input: { value: 1 } });
    const second = await engine.start(definition, { sagaId: 'same', input: { value: 1 } });
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(driver.getDomain().values).toEqual([-1]);
    await expect(
      engine.start(definition, { sagaId: 'same', input: { value: 2 } })
    ).rejects.toBeInstanceOf(SagaConflictError);
  });

  it('retains reservations while blocked', async () => {
    const definition = createTestDefinition({
      execute: async () => {
        throw new SagaNonRetryableError('cannot continue');
      }
    });
    const { engine, driver } = createTestRuntime(definition);
    await engine.start(definition, { sagaId: 'blocked', input: { value: 1 } });
    const result = await engine.run('blocked');

    expect(result.type).toBe('blocked');
    expect(driver.getReservationOwner('shared')).toBe('blocked');
  });

  it('executes the registry-owned canonical definition, not a same-manifest lookalike', async () => {
    const registered = createTestDefinition({ execute: async () => 3 });
    const lookalike = createTestDefinition({ execute: async () => 999 });
    const driver = createMemorySagaDriver<TestDomain>({ values: [] });
    const registry = createSagaRegistry<TestTransaction>();
    registry.register(registered);
    registry.seal();
    const engine = createSagaEngine({
      store: driver,
      registry,
      heartbeatIntervalMs: 1_000,
      executionStaleMs: 10_000
    });

    const result = await engine.start(lookalike, {
      sagaId: 'canonical',
      input: { value: 1 },
      run: true
    });

    expect(result.runResult?.type).toBe('completed');
    expect(driver.getDomain().values).toEqual([-1, 3]);
  });

  it('holds initialization inside definition-specific advisory leases', async () => {
    const base = createTestDefinition();
    let leaseHeld = false;
    const definition = bindSaga(
      defineSaga<TestInput, TestState, TestTransaction>({
        name: 'test.initialization-lease',
        version: 1,
        input: base.input,
        state: base.state,
        initialState: base.initialState,
        reservationKeys: () => ['durable'],
        initializationLeaseKeys: () => ['transient'],
        executionLeaseKeys: () => ['durable'],
        steps: base.steps
      }),
      {
        initialize: async () => {
          expect(leaseHeld).toBe(true);
        }
      }
    );
    const driver = createMemorySagaDriver<TestDomain>({ values: [] });
    const registry = createSagaRegistry<TestTransaction>();
    registry.register(definition);
    registry.seal();
    const observedKeys: string[][] = [];
    const engine = createSagaEngine({
      store: driver,
      registry,
      leaseProvider: {
        async withLeases(keys, run) {
          observedKeys.push([...keys]);
          leaseHeld = true;
          try {
            return await run({
              signal: new AbortController().signal,
              async assertValid() {}
            });
          } finally {
            leaseHeld = false;
          }
        }
      },
      heartbeatIntervalMs: 1_000,
      executionStaleMs: 10_000
    });

    await engine.start(definition, { sagaId: 'lease-start', input: { value: 1 } });
    expect(observedKeys).toEqual([['transient']]);
  });
});

describe('DurableSagaEngine.run', () => {
  it('checkpoints state and domain projection before releasing reservations', async () => {
    const { engine, definition, driver } = createTestRuntime();
    await engine.start(definition, { sagaId: 'success', input: { value: 4 } });

    const result = await engine.run('success');

    expect(result.type).toBe('completed');
    expect(result.type === 'completed' ? result.snapshot.state : undefined).toEqual({
      value: 4,
      keys: []
    });
    expect(driver.getDomain()).toEqual({ values: [-1, 4], terminal: 'completed' });
    expect(driver.getReservationOwner('shared')).toBeUndefined();
  });

  it('retries an idempotent Activity with a stable idempotency key', async () => {
    const keys: string[] = [];
    let attempt = 0;
    const definition = createTestDefinition({
      execute: async (runtime) => {
        keys.push(runtime.idempotencyKey);
        if (++attempt === 1) throw new Error('temporary');
        return runtime.input.value;
      }
    });
    const { engine, clock } = createTestRuntime(definition);
    await engine.start(definition, { sagaId: 'retry', input: { value: 2 } });

    const first = await engine.run('retry');
    expect(first.type).toBe('scheduled');
    await clock.advanceBy(100);
    const second = await engine.run('retry');

    expect(second.type).toBe('completed');
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(1);
  });

  it('reconciles an uncertain effect before replaying execute', async () => {
    let executeCount = 0;
    let reconcileCount = 0;
    const step = defineStep<TestInput, TestState, number, TestTransaction>({
      id: 'remote-write',
      output: schema<number>(),
      effect: {
        type: 'reconcileRequired',
        isolationMs: 200,
        reconcile: async () => {
          reconcileCount++;
          return { type: 'applied', output: 7 };
        }
      },
      retry: defaultRetry,
      timeoutMs: 10_000,
      execute: async () => {
        executeCount++;
        throw new Error('response lost after apply');
      },
      apply: ({ state, output }) => ({ ...state, value: output })
    });
    const definition = bindSaga(
      defineSaga<TestInput, TestState, TestTransaction>({
        name: 'test.reconcile',
        version: 1,
        input: schema<TestInput>(),
        state: schema<TestState>(),
        initialState: () => ({ value: 0, keys: [] }),
        reservationKeys: () => ['remote'],
        steps: [step]
      }),
      {}
    );
    const { engine, clock } = createTestRuntime(definition);
    await engine.start(definition, { sagaId: 'reconcile', input: { value: 1 } });

    expect((await engine.run('reconcile')).type).toBe('scheduled');
    await clock.advanceBy(100);
    expect((await engine.run('reconcile')).type).toBe('scheduled');
    await clock.advanceBy(100);
    const result = await engine.run('reconcile');

    expect(result.type).toBe('completed');
    expect(executeCount).toBe(1);
    expect(reconcileCount).toBe(1);
  });

  it('blocks deterministic output validation without replaying the Activity', async () => {
    let calls = 0;
    const definition = createTestDefinition({
      execute: async () => {
        calls++;
        return 'invalid' as unknown as number;
      }
    });
    const { engine } = createTestRuntime(definition);
    await engine.start(definition, { sagaId: 'invalid-output', input: { value: 1 } });

    const result = await engine.run('invalid-output');

    expect(result.type).toBe('blocked');
    expect(calls).toBe(1);
    expect(result.type === 'blocked' ? result.snapshot.lastError?.code : undefined).toBe(
      'SAGA_DEFINITION_INVALID'
    );
  });

  it('requires an explicit operator assertion before replaying a manual Activity', async () => {
    let calls = 0;
    const definition = createTestDefinition({
      effect: 'manual',
      execute: async () => {
        calls++;
        throw new Error('unknown outcome');
      }
    });
    const { engine } = createTestRuntime(definition);
    await engine.start(definition, { sagaId: 'manual-resolution', input: { value: 1 } });
    const first = await engine.run('manual-resolution');
    expect(first.type).toBe('blocked');

    const retryReconcile = await engine.resolveBlocked('manual-resolution', {
      expectedRevision: first.type === 'blocked' ? first.snapshot.revision : -1,
      resolution: { type: 'retryReconcile' }
    });
    expect((await engine.run('manual-resolution')).type).toBe('blocked');
    expect(calls).toBe(1);

    const current = await engine.get('manual-resolution');
    await engine.resolveBlocked('manual-resolution', {
      expectedRevision: current!.revision,
      resolution: { type: 'confirmNotApplied' }
    });
    expect((await engine.run('manual-resolution')).type).toBe('blocked');
    expect(calls).toBe(2);
    expect(retryReconcile.currentStep).toBeDefined();
  });

  it('blocks terminal domain conflicts and persists failed terminals when configured', async () => {
    const conflicting = createTestDefinition({
      onComplete: async () => {
        throw new SagaConflictError('aggregate changed');
      }
    });
    const conflictRuntime = createTestRuntime(conflicting);
    await conflictRuntime.engine.start(conflicting, {
      sagaId: 'terminal-conflict',
      input: { value: 1 }
    });
    expect((await conflictRuntime.engine.run('terminal-conflict')).type).toBe('blocked');

    const failing = createTestDefinition({
      execute: async () => {
        throw new SagaNonRetryableError('fatal');
      },
      onFailure: async ({ transaction }) => {
        transaction.domain.terminal = 'failed';
      }
    });
    const failedRuntime = createTestRuntime(failing);
    await failedRuntime.engine.start(failing, { sagaId: 'terminal-failed', input: { value: 1 } });
    const failed = await failedRuntime.engine.run('terminal-failed');
    expect(failed.type).toBe('terminal');
    expect(failed.type === 'terminal' ? failed.snapshot.status : undefined).toBe('failed');
    expect(failedRuntime.driver.getDomain().terminal).toBe('failed');
    expect(failedRuntime.driver.getReservationOwner('shared')).toBeUndefined();
  });
});

describe('DurableSagaEngine.recoverDue', () => {
  it('keeps wake-up failures diagnostic and relies on the durable due record', async () => {
    const definition = createTestDefinition();
    const driver = createMemorySagaDriver<TestDomain>({ values: [] });
    const registry = createSagaRegistry<TestTransaction>();
    registry.register(definition);
    registry.seal();
    const events: string[] = [];
    const engine = createSagaEngine({
      store: driver,
      registry,
      wakeupScheduler: {
        async schedule() {
          throw new Error('queue unavailable');
        }
      },
      observer: {
        onEvent: (event) => {
          events.push(event.type);
        }
      },
      heartbeatIntervalMs: 1_000,
      executionStaleMs: 10_000
    });

    await expect(
      engine.start(definition, { sagaId: 'queue-failure', input: { value: 1 } })
    ).resolves.toMatchObject({ created: true });
    expect(events).toContain('wakeupFailed');
    expect((await engine.get('queue-failure'))?.status).toBe('pending');
    await engine.recoverDue();
    expect(events.filter((event) => event === 'wakeupFailed')).toHaveLength(1);
    expect((await engine.get('queue-failure'))?.status).toBe('completed');
  });
});

describe('DurableSagaEngine edge results', () => {
  it('rejects invalid engine and start configuration before persistence', async () => {
    const definition = createTestDefinition();
    const driver = createMemorySagaDriver<TestDomain>({ values: [] });
    const unsealed = createSagaRegistry<TestTransaction>();
    expect(() => createSagaEngine({ store: driver, registry: unsealed })).toThrow('sealed');
    unsealed.seal();
    expect(() =>
      createSagaEngine({
        store: driver,
        registry: unsealed,
        heartbeatIntervalMs: 10,
        executionStaleMs: 10
      })
    ).toThrow('executionStaleMs');
    const engine = createSagaEngine({ store: driver, registry: unsealed });
    await expect(
      engine.start(definition, { sagaId: 'unregistered', input: { value: 1 } })
    ).rejects.toThrow('not registered');

    const emptyKey = bindSaga(
      defineSaga<TestInput, TestState, TestTransaction>({
        name: 'test.empty-key',
        version: 1,
        input: definition.input,
        state: definition.state,
        initialState: definition.initialState,
        reservationKeys: () => [' '],
        steps: definition.steps
      }),
      {}
    );
    const emptyRegistry = createSagaRegistry<TestTransaction>();
    emptyRegistry.register(emptyKey);
    emptyRegistry.seal();
    const emptyEngine = createSagaEngine({ store: driver, registry: emptyRegistry });
    await expect(
      emptyEngine.start(emptyKey, { sagaId: 'empty-key', input: { value: 1 } })
    ).rejects.toThrow('cannot be empty');
  });

  it('reports stale wakeups, not-due retries, busy ownership and missing definitions', async () => {
    const definition = createTestDefinition({
      execute: async () => {
        throw new Error('retry');
      }
    });
    const runtime = createTestRuntime(definition);
    const started = await runtime.engine.start(definition, {
      sagaId: 'edge-results',
      input: { value: 1 }
    });
    expect(
      (
        await runtime.engine.run('edge-results', {
          expectedRevision: started.snapshot.revision + 1
        })
      ).type
    ).toBe('staleWakeup');
    expect((await runtime.engine.run('edge-results')).type).toBe('scheduled');
    expect((await runtime.engine.run('edge-results')).type).toBe('notDue');

    const busyDefinition = createTestDefinition({ name: 'test.busy' });
    const busyRuntime = createTestRuntime(busyDefinition);
    await busyRuntime.engine.start(busyDefinition, { sagaId: 'busy', input: { value: 2 } });
    await busyRuntime.driver.claimExecution({
      sagaId: 'busy',
      token: 'other-owner',
      now: busyRuntime.clock.now(),
      staleBefore: new Date(busyRuntime.clock.now().getTime() - 1)
    });
    expect((await busyRuntime.engine.run('busy')).type).toBe('busy');

    const unavailableRegistry = createSagaRegistry<TestTransaction>();
    unavailableRegistry.seal();
    const unavailableEngine = createSagaEngine({
      store: busyRuntime.driver,
      registry: unavailableRegistry,
      clock: busyRuntime.clock,
      heartbeatIntervalMs: 1_000,
      executionStaleMs: 10_000
    });
    expect((await unavailableEngine.run('busy')).type).toBe('definitionUnavailable');
    expect((await unavailableEngine.run('missing')).type).toBe('notFound');
  });

  it('validates persisted input/state before an Activity sees driver data', async () => {
    const step = defineStep<TestInput, TestState, number, TestTransaction>({
      id: 'validated',
      output: schema<number>(),
      effect: { type: 'idempotent' },
      retry: { maxAttempts: 1, initialIntervalMs: 0 },
      timeoutMs: 1_000,
      execute: async () => 1,
      apply: ({ state }) => state
    });
    const definition = bindSaga(
      defineSaga<TestInput, TestState, TestTransaction>({
        name: 'test.persisted-validation',
        version: 1,
        input: schema<TestInput>((value) => {
          if (!value || typeof value !== 'object') throw new TypeError('invalid input');
          return value as TestInput;
        }),
        state: schema<TestState>((value) => {
          if (!value || typeof value !== 'object') throw new TypeError('invalid state');
          return value as TestState;
        }),
        initialState: () => ({ value: 0, keys: [] }),
        reservationKeys: () => [],
        steps: [step]
      }),
      {}
    );
    const driver = createMemorySagaDriver<TestDomain>({ values: [] });
    const registry = createSagaRegistry<TestTransaction>();
    registry.register(definition);
    registry.seal();
    const engine = createSagaEngine({
      store: { ...driver, load: async () => ({ ...(await driver.load('corrupt'))!, state: null }) },
      registry,
      heartbeatIntervalMs: 1_000,
      executionStaleMs: 10_000
    });
    await driver.start({
      snapshot: {
        sagaId: 'corrupt',
        name: definition.name,
        version: definition.version,
        manifestSignature: definition.manifestSignature,
        inputHash: 'hash',
        reservationKeys: [],
        status: 'pending',
        input: { value: 1 },
        state: { value: 0, keys: [] },
        nextStepIndex: 0,
        executionEpoch: 0,
        revision: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      async initialize() {}
    });

    const result = await engine.run('corrupt');
    expect(result.type).toBe('invalidSnapshot');
    expect(result.type === 'invalidSnapshot' ? result.error.message : '').toContain(
      'invalid state'
    );
  });

  it('checkpoints skipped steps and yields bounded execution slices', async () => {
    const skipped = defineStep<TestInput, TestState, number, TestTransaction>({
      id: 'skipped',
      output: schema<number>(),
      effect: { type: 'idempotent' },
      retry: { maxAttempts: 1, initialIntervalMs: 0 },
      timeoutMs: 1_000,
      when: () => false,
      execute: async () => 1,
      apply: ({ state }) => state
    });
    const applied = defineStep<TestInput, TestState, number, TestTransaction>({
      id: 'applied',
      output: schema<number>(),
      effect: { type: 'idempotent' },
      retry: { maxAttempts: 1, initialIntervalMs: 0 },
      timeoutMs: 1_000,
      execute: async () => 2,
      apply: ({ state, output }) => ({ ...state, value: output })
    });
    const definition = bindSaga(
      defineSaga<TestInput, TestState, TestTransaction>({
        name: 'test.yield',
        version: 1,
        input: schema<TestInput>(),
        state: schema<TestState>(),
        initialState: () => ({ value: 0, keys: [] }),
        reservationKeys: () => [],
        steps: [skipped, applied]
      }),
      {}
    );
    const driver = createMemorySagaDriver<TestDomain>({ values: [] });
    const registry = createSagaRegistry<TestTransaction>();
    registry.register(definition);
    registry.seal();
    const engine = createSagaEngine({
      store: driver,
      registry,
      maxStepsPerRun: 1,
      heartbeatIntervalMs: 1_000,
      executionStaleMs: 10_000
    });
    await engine.start(definition, { sagaId: 'yield', input: { value: 1 } });
    expect((await engine.run('yield')).type).toBe('scheduled');
    expect((await engine.run('yield')).type).toBe('scheduled');
    const completed = await engine.run('yield');
    expect(completed.type).toBe('completed');
    expect(completed.type === 'completed' ? completed.snapshot.state : undefined).toMatchObject({
      value: 2
    });
  });

  it('supports pending and not-applied reconcile outcomes without blind replay', async () => {
    let executeCalls = 0;
    let reconcileCalls = 0;
    const step = defineStep<TestInput, TestState, number, TestTransaction>({
      id: 'reconcile-outcomes',
      output: schema<number>(),
      effect: {
        type: 'reconcileRequired',
        isolationMs: 0,
        reconcile: async () => {
          reconcileCalls++;
          return reconcileCalls === 1
            ? { type: 'pending', retryAfterMs: 50 }
            : { type: 'notApplied' };
        }
      },
      retry: defaultRetry,
      timeoutMs: 1_000,
      execute: async () => {
        executeCalls++;
        if (executeCalls === 1) throw new Error('lost');
        return 5;
      },
      apply: ({ state, output }) => ({ ...state, value: output })
    });
    const definition = bindSaga(
      defineSaga<TestInput, TestState, TestTransaction>({
        name: 'test.reconcile-outcomes',
        version: 1,
        input: schema<TestInput>(),
        state: schema<TestState>(),
        initialState: () => ({ value: 0, keys: [] }),
        reservationKeys: () => [],
        steps: [step]
      }),
      {}
    );
    const runtime = createTestRuntime(definition);
    await runtime.engine.start(definition, { sagaId: 'outcomes', input: { value: 1 } });
    expect((await runtime.engine.run('outcomes')).type).toBe('scheduled');
    await runtime.clock.advanceBy(100);
    expect((await runtime.engine.run('outcomes')).type).toBe('scheduled');
    await runtime.clock.advanceBy(50);
    expect((await runtime.engine.run('outcomes')).type).toBe('completed');
    expect({ executeCalls, reconcileCalls }).toEqual({ executeCalls: 2, reconcileCalls: 2 });
  });

  it('validates operator resolution revisions', async () => {
    const runtime = createTestRuntime(
      createTestDefinition({
        execute: async () => {
          throw new SagaNonRetryableError('blocked');
        }
      })
    );
    await expect(
      runtime.engine.resolveBlocked('missing', {
        expectedRevision: 0,
        resolution: { type: 'retryReconcile' }
      })
    ).rejects.toThrow('not found');
    await runtime.engine.start(runtime.definition, { sagaId: 'operator', input: { value: 1 } });
    await expect(
      runtime.engine.resolveBlocked('operator', {
        expectedRevision: 0,
        resolution: { type: 'retryReconcile' }
      })
    ).rejects.toThrow('not blocked');
    const blocked = await runtime.engine.run('operator');
    await expect(
      runtime.engine.resolveBlocked('operator', {
        expectedRevision: blocked.type === 'blocked' ? blocked.snapshot.revision - 1 : -1,
        resolution: { type: 'retryReconcile' }
      })
    ).rejects.toThrow('changed');
  });
});
