import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  bindSaga,
  createSagaRegistry,
  defineSaga,
  defineStep,
  type SagaActivityRuntime
} from '../src';
import { schema, type TestInput, type TestState, type TestTransaction } from './helpers';

describe('defineSaga', () => {
  it('rejects invalid identity and step policies', () => {
    const makeStep = (overrides: Record<string, unknown> = {}) =>
      defineStep<TestInput, TestState, number, TestTransaction>({
        id: 'step',
        output: schema<number>(),
        effect: { type: 'idempotent' },
        retry: { maxAttempts: 1, initialIntervalMs: 0 },
        timeoutMs: 1,
        execute: async () => 1,
        apply: ({ state }) => state,
        ...overrides
      });
    const makeDefinition = (overrides: Record<string, unknown>) => () =>
      defineSaga<TestInput, TestState, TestTransaction>({
        name: 'valid',
        version: 1,
        input: schema<TestInput>(),
        state: schema<TestState>(),
        initialState: () => ({ value: 0, keys: [] }),
        reservationKeys: () => [],
        steps: [makeStep()],
        ...overrides
      });

    expect(makeDefinition({ name: ' ' })).toThrow('name');
    expect(makeDefinition({ version: 0 })).toThrow('version');
    expect(makeDefinition({ steps: [] })).toThrow('at least one step');
    expect(makeDefinition({ steps: [makeStep({ id: '' })] })).toThrow('non-empty');
    const duplicate = makeStep({ id: 'duplicate' });
    expect(makeDefinition({ steps: [duplicate, duplicate] })).toThrow('unique');
    expect(
      makeDefinition({ steps: [makeStep({ retry: { maxAttempts: 0, initialIntervalMs: 0 } })] })
    ).toThrow('maxAttempts');
    expect(makeDefinition({ steps: [makeStep({ timeoutMs: 0 })] })).toThrow('invalid retry');
    expect(
      makeDefinition({
        steps: [
          makeStep({
            effect: {
              type: 'reconcileRequired',
              isolationMs: -1,
              reconcile: async () => ({ type: 'notApplied' as const })
            }
          })
        ]
      })
    ).toThrow('isolationMs');
  });

  it('retains Activity input, state and output inference', () => {
    const step = defineStep({
      id: 'typed',
      output: schema<number>(),
      effect: { type: 'idempotent' as const },
      retry: { maxAttempts: 1, initialIntervalMs: 0 },
      timeoutMs: 100,
      execute: async (runtime: SagaActivityRuntime<TestInput, TestState>) => runtime.input.value,
      apply: ({ state, output }: { state: TestState; output: number }) => ({
        ...state,
        value: state.value + output
      })
    });

    expectTypeOf(step.execute).returns.resolves.toEqualTypeOf<number>();
    expectTypeOf(step.apply).returns.toEqualTypeOf<TestState>();
  });
});

describe('createSagaRegistry', () => {
  it('rejects duplicate registrations and mutations after seal', () => {
    const step = defineStep<TestInput, TestState, number, TestTransaction>({
      id: 'step',
      output: schema<number>(),
      effect: { type: 'idempotent' },
      retry: { maxAttempts: 1, initialIntervalMs: 0 },
      timeoutMs: 100,
      execute: async () => 1,
      apply: ({ state }) => state
    });
    const definition = bindSaga(
      defineSaga<TestInput, TestState, TestTransaction>({
        name: 'registry.test',
        version: 1,
        input: schema<TestInput>(),
        state: schema<TestState>(),
        initialState: () => ({ value: 0, keys: [] }),
        reservationKeys: () => [],
        steps: [step]
      }),
      {}
    );
    const registry = createSagaRegistry<TestTransaction>();

    registry.register(definition);
    expect(() => registry.register(definition)).toThrow('already registered');
    registry.seal();
    expect(() => registry.register(definition)).toThrow('registry is sealed');
  });
});
