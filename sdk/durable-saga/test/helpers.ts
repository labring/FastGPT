import {
  bindSaga,
  createSagaEngine,
  createSagaRegistry,
  defineSaga,
  defineStep,
  type BoundSaga,
  type RuntimeSchema,
  type SagaRetryPolicy
} from '../src';
import {
  createManualSagaClock,
  createMemorySagaDriver,
  type ManualSagaClock,
  type MemorySagaDriver,
  type MemorySagaTransaction
} from './support';

export type TestInput = { value: number };
export type TestState = { value: number; keys: string[] };
export type TestDomain = { values: number[]; terminal?: string };
export type TestTransaction = MemorySagaTransaction<TestDomain>;

export const schema = <T>(validate?: (value: unknown) => T): RuntimeSchema<T> => ({
  parse(value) {
    return validate ? validate(value) : (value as T);
  }
});

export const defaultRetry: SagaRetryPolicy = {
  maxAttempts: 3,
  initialIntervalMs: 100,
  backoffCoefficient: 2,
  maxIntervalMs: 1_000
};

export const createTestDefinition = (params?: {
  name?: string;
  effect?: 'idempotent' | 'manual';
  execute?: Parameters<
    typeof defineStep<TestInput, TestState, number, TestTransaction>
  >[0]['execute'];
  retry?: SagaRetryPolicy;
  onComplete?: BoundSaga<TestInput, TestState, TestTransaction>['binding']['onComplete'];
  onFailure?: BoundSaga<TestInput, TestState, TestTransaction>['binding']['onFailure'];
}): BoundSaga<TestInput, TestState, TestTransaction> => {
  const step = defineStep<TestInput, TestState, number, TestTransaction>({
    id: 'increment',
    output: schema<number>((value) => {
      if (typeof value !== 'number') throw new TypeError('Output must be a number');
      return value;
    }),
    effect: { type: params?.effect ?? 'idempotent' },
    retry: params?.retry ?? defaultRetry,
    timeoutMs: 10_000,
    execute: params?.execute ?? (async ({ input }) => input.value),
    apply: ({ state, output }) => ({ ...state, value: state.value + output }),
    project: async ({ transaction, output }) => {
      transaction.domain.values.push(output);
    }
  });
  return bindSaga(
    defineSaga<TestInput, TestState, TestTransaction>({
      name: params?.name ?? 'test.increment',
      version: 1,
      input: schema<TestInput>(),
      state: schema<TestState>(),
      initialState: () => ({ value: 0, keys: [] }),
      reservationKeys: (input) => [`value:${input.value}`, 'shared'],
      steps: [step]
    }),
    {
      initialize: async ({ transaction }) => {
        transaction.domain.values.push(-1);
      },
      onComplete:
        params?.onComplete ??
        (async ({ transaction }) => {
          transaction.domain.terminal = 'completed';
        }),
      onFailure: params?.onFailure
    }
  );
};

export const createTestRuntime = (
  definition: BoundSaga<TestInput, TestState, TestTransaction> = createTestDefinition()
) => {
  const clock = createManualSagaClock(new Date('2026-01-01T00:00:00.000Z'));
  const driver = createMemorySagaDriver<TestDomain>({ values: [] });
  const registry = createSagaRegistry<TestTransaction>();
  registry.register(definition);
  registry.seal();
  let nextId = 0;
  const engine = createSagaEngine({
    store: driver,
    registry,
    clock,
    idGenerator: { nextId: () => `execution-${++nextId}` },
    heartbeatIntervalMs: 1_000,
    executionStaleMs: 10_000
  });
  return { clock, driver, engine, definition } satisfies {
    clock: ManualSagaClock;
    driver: MemorySagaDriver<TestDomain>;
    engine: typeof engine;
    definition: typeof definition;
  };
};
