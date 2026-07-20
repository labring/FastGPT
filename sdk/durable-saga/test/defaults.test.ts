import { describe, expect, it } from 'vitest';
import {
  SagaDefinitionError,
  SagaBlockedError,
  SagaExecutionLostError,
  SagaNotFoundError,
  assertSagaSnapshot,
  calculateRetryDelay,
  serializeSagaError
} from '../src';
import { defaultSagaValueHasher } from '../src/runtime/defaults';

const baseSnapshot = () => ({
  sagaId: 'snapshot',
  name: 'snapshot.test',
  version: 1,
  manifestSignature: 'v1',
  inputHash: 'hash',
  reservationKeys: ['a'],
  status: 'pending' as const,
  input: {},
  state: {},
  nextStepIndex: 0,
  executionEpoch: 0,
  revision: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z')
});

describe('defaultSagaValueHasher', () => {
  it('normalizes object order and optional undefined fields', async () => {
    await expect(defaultSagaValueHasher.hash({ b: 2, omitted: undefined, a: 1 })).resolves.toBe(
      await defaultSagaValueHasher.hash({ a: 1, b: 2 })
    );
  });

  it('uses type-tagged values without bigint, string, Date or object collisions', async () => {
    const at = new Date('2026-01-01T00:00:00.000Z');
    const values = [1n, '1n', at, { $date: at.toISOString() }];
    const hashes = await Promise.all(values.map((value) => defaultSagaValueHasher.hash(value)));
    expect(new Set(hashes)).toHaveLength(values.length);
  });

  it('rejects persistence-unstable or cyclic input values', async () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    await expect(defaultSagaValueHasher.hash([undefined])).rejects.toBeInstanceOf(
      SagaDefinitionError
    );
    await expect(defaultSagaValueHasher.hash(Number.POSITIVE_INFINITY)).rejects.toBeInstanceOf(
      SagaDefinitionError
    );
    await expect(defaultSagaValueHasher.hash(cyclic)).rejects.toBeInstanceOf(SagaDefinitionError);
    await expect(defaultSagaValueHasher.hash(new Map())).rejects.toBeInstanceOf(
      SagaDefinitionError
    );
  });
});

describe('persisted diagnostics and invariants', () => {
  it('redacts, bounds and de-cycles durable error details', () => {
    const details: Record<string, unknown> = {
      apiKey: 'secret',
      message: 'x'.repeat(5_000)
    };
    details.self = details;
    const serialized = serializeSagaError(
      new (class extends Error {
        code = 'CUSTOM';
        details = details;
      })('plain error')
    );
    // Plain Error subclasses do not opt into durable details.
    expect(serialized).toEqual({ name: 'Error', message: 'plain error' });

    const durable = serializeSagaError(
      new (class extends SagaDefinitionError {})('invalid', details)
    );
    expect(durable.details).toMatchObject({ apiKey: '[redacted]', self: '[circular]' });
    expect((durable.details as { message: string }).message).toContain('[truncated]');

    const recursive: unknown[] = [1n, new Date('2026-01-01T00:00:00.000Z')];
    recursive.push(recursive, Symbol('diagnostic'));
    const nested = { level: { level: { level: { level: { level: { level: true } } } } } };
    const collections = serializeSagaError(
      new SagaDefinitionError('collections', { recursive, nested })
    );
    expect(collections.details).toMatchObject({
      recursive: ['1', '2026-01-01T00:00:00.000Z', '[circular]', 'Symbol(diagnostic)']
    });
    expect(JSON.stringify(collections.details)).toContain('[max-depth]');
  });

  it('validates execution ownership invariants and caps retry delay', () => {
    expect(() => assertSagaSnapshot({ ...baseSnapshot(), revision: -1 })).toThrow('revision');
    expect(() =>
      assertSagaSnapshot({ ...baseSnapshot(), status: 'running', execution: undefined })
    ).toThrow('execution ownership');
    expect(() => assertSagaSnapshot({ ...baseSnapshot(), reservationKeys: ['a', 'a'] })).toThrow(
      'unique'
    );
    expect(() =>
      assertSagaSnapshot({ ...baseSnapshot(), status: 'waiting', nextRunAt: undefined })
    ).toThrow('nextRunAt');
    expect(() => assertSagaSnapshot({ ...baseSnapshot(), executionEpoch: -1 })).toThrow(
      'executionEpoch'
    );
    expect(() => assertSagaSnapshot({ ...baseSnapshot(), nextStepIndex: -1 })).toThrow(
      'nextStepIndex'
    );
    expect(() =>
      assertSagaSnapshot({
        ...baseSnapshot(),
        status: 'completed',
        execution: { token: 'token', epoch: 1, heartbeatAt: new Date() }
      })
    ).toThrow('terminal Saga');
    expect(
      calculateRetryDelay(10, {
        initialIntervalMs: 100,
        backoffCoefficient: 2,
        maxIntervalMs: 1_000
      })
    ).toBe(1_000);
  });

  it('keeps public error codes stable', () => {
    expect(new SagaNotFoundError('missing')).toMatchObject({ code: 'SAGA_NOT_FOUND' });
    expect(new SagaExecutionLostError('lost')).toMatchObject({ code: 'SAGA_EXECUTION_LOST' });
    expect(new SagaBlockedError('blocked')).toMatchObject({ code: 'SAGA_BLOCKED' });
  });
});
