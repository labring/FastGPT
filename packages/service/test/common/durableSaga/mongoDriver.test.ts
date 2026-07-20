import {
  bindSaga,
  createSagaEngine,
  createSagaRegistry,
  defineSaga,
  defineStep,
  SagaConflictError,
  type DurableSagaSnapshot,
  type RuntimeSchema
} from '@fastgpt-sdk/durable-saga';
import {
  createMongoDurableSagaStore,
  MongoDurableSagaInstance,
  MongoDurableSagaReservation
} from '@fastgpt/service/common/durableSaga';
import { connectionMongo, getMongoModel, type ClientSession } from '@fastgpt/service/common/mongo';
import { beforeAll, describe, expect, it } from 'vitest';

const { Schema } = connectionMongo;

const MongoSagaTestProjection = getMongoModel<{ key: string; values: number[]; terminal?: string }>(
  'durable_saga_test_projections',
  new Schema(
    {
      key: { type: String, required: true, unique: true },
      values: { type: [Number], required: true },
      terminal: String
    },
    { strict: 'throw' }
  )
);

const schema = <T>(): RuntimeSchema<T> => ({ parse: (value) => value as T });
const now = new Date('2026-01-01T00:00:00.000Z');

const createSnapshot = (sagaId: string, reservationKeys: string[]): DurableSagaSnapshot => ({
  sagaId,
  name: 'mongo.contract',
  version: 1,
  manifestSignature: 'mongo-contract-v1',
  inputHash: sagaId,
  reservationKeys,
  status: 'pending',
  input: { value: 1 },
  state: { value: 0 },
  nextStepIndex: 0,
  executionEpoch: 0,
  nextRunAt: now,
  revision: 0,
  createdAt: now,
  updatedAt: now
});

beforeAll(async () => {
  await Promise.all([
    MongoDurableSagaInstance.syncIndexes(),
    MongoDurableSagaReservation.syncIndexes(),
    MongoSagaTestProjection.syncIndexes()
  ]);
});

describe('createMongoDurableSagaStore.start', () => {
  it('round-trips an empty object state without Mongoose minimizing the field', async () => {
    const store = createMongoDurableSagaStore();
    await store.start({
      snapshot: { ...createSnapshot('empty-state', []), state: {} },
      async initialize() {}
    });

    await expect(store.load('empty-state')).resolves.toMatchObject({ state: {} });
  });

  it('rolls back reservations, domain initialization and instance creation together', async () => {
    const store = createMongoDurableSagaStore();

    await expect(
      store.start({
        snapshot: createSnapshot('rollback', ['a', 'b']),
        initialize: async (session) => {
          await MongoSagaTestProjection.create([{ key: 'rollback', values: [1] }], { session });
          throw new Error('initialize failed');
        }
      })
    ).rejects.toThrow('initialize failed');

    expect(await MongoDurableSagaInstance.countDocuments({ sagaId: 'rollback' })).toBe(0);
    expect(await MongoDurableSagaReservation.countDocuments({ ownerSagaId: 'rollback' })).toBe(0);
    expect(await MongoSagaTestProjection.countDocuments({ key: 'rollback' })).toBe(0);
  });

  it('atomically rejects a contender when any reservation key is occupied', async () => {
    const store = createMongoDurableSagaStore();
    await store.start({
      snapshot: createSnapshot('owner', ['shared', 'owner-only']),
      async initialize() {}
    });

    await expect(
      store.start({
        snapshot: createSnapshot('contender', ['contender-only', 'shared']),
        async initialize() {}
      })
    ).rejects.toBeInstanceOf(SagaConflictError);
    expect(await MongoDurableSagaReservation.countDocuments({ key: 'contender-only' })).toBe(0);
  });
});

describe('createMongoDurableSagaStore execution fencing', () => {
  it('increments epoch on stale takeover and rejects the previous token', async () => {
    const store = createMongoDurableSagaStore();
    await store.start({
      snapshot: createSnapshot('takeover', ['resource']),
      async initialize() {}
    });
    const first = await store.claimExecution({
      sagaId: 'takeover',
      token: 'first-token',
      now,
      staleBefore: new Date(now.getTime() - 1)
    });
    const takeoverAt = new Date(now.getTime() + 1_000);
    const second = await store.claimExecution({
      sagaId: 'takeover',
      token: 'second-token',
      now: takeoverAt,
      staleBefore: takeoverAt
    });

    expect(first?.snapshot.executionEpoch).toBe(1);
    expect(second?.snapshot.executionEpoch).toBe(2);
    expect(
      await store.heartbeat({
        sagaId: 'takeover',
        executionToken: 'second-token',
        executionEpoch: 2,
        now: takeoverAt
      })
    ).toBe(true);
    expect(
      await store.heartbeat({
        sagaId: 'takeover',
        executionToken: 'second-token',
        executionEpoch: 1,
        now: takeoverAt
      })
    ).toBe(false);
    expect(
      await store.persistStepAttempt({
        sagaId: 'takeover',
        executionToken: 'first-token',
        executionEpoch: first!.snapshot.executionEpoch,
        expectedRevision: first!.snapshot.revision,
        now: takeoverAt,
        currentStep: {
          stepId: 'effect',
          phase: 'started',
          executeAttempts: 1,
          reconcileAttempts: 0,
          idempotencyKey: 'stable-key',
          startedAt: now,
          takeoverNotBefore: now
        }
      })
    ).toBeNull();
    expect(await MongoDurableSagaInstance.collection.findOne({ _id: 'takeover' })).toMatchObject({
      sagaId: 'takeover'
    });
    expect(await MongoDurableSagaReservation.collection.findOne({ _id: 'resource' })).toMatchObject(
      { _id: 'resource', ownerSagaId: 'takeover' }
    );
  });
});

describe('Mongo durable Saga engine', () => {
  it('commits step projection and terminal hook before releasing reservations', async () => {
    type Input = { value: number };
    type State = { total: number };
    const step = defineStep<Input, State, number, ClientSession>({
      id: 'write-value',
      output: schema<number>(),
      effect: { type: 'idempotent' },
      retry: { maxAttempts: 2, initialIntervalMs: 1 },
      timeoutMs: 1_000,
      execute: async ({ input }) => input.value,
      apply: ({ state, output }) => ({ total: state.total + output }),
      project: async ({ transaction, sagaId, output }) => {
        await MongoSagaTestProjection.updateOne(
          { key: sagaId },
          { $push: { values: output } },
          { session: transaction }
        );
      }
    });
    const definition = bindSaga(
      defineSaga<Input, State, ClientSession>({
        name: 'mongo.engine',
        version: 1,
        input: schema<Input>(),
        state: schema<State>(),
        initialState: () => ({ total: 0 }),
        reservationKeys: () => ['mongo-engine-shared'],
        steps: [step]
      }),
      {
        initialize: async ({ transaction, sagaId }) => {
          await MongoSagaTestProjection.create([{ key: sagaId, values: [] }], {
            session: transaction
          });
        },
        onComplete: async ({ transaction, sagaId }) => {
          await MongoSagaTestProjection.updateOne(
            { key: sagaId },
            { $set: { terminal: 'completed' } },
            { session: transaction }
          );
        }
      }
    );
    const registry = createSagaRegistry<ClientSession>();
    registry.register(definition);
    registry.seal();
    const engine = createSagaEngine({
      store: createMongoDurableSagaStore(),
      registry,
      idGenerator: { nextId: () => 'mongo-engine-execution' },
      heartbeatIntervalMs: 100,
      executionStaleMs: 1_000
    });

    await engine.start(definition, { sagaId: 'mongo-engine-saga', input: { value: 5 } });
    const result = await engine.run('mongo-engine-saga');

    expect(result.type).toBe('completed');
    expect(
      await MongoSagaTestProjection.findOne({ key: 'mongo-engine-saga' })
        .select('-_id values terminal')
        .lean()
    ).toEqual({ values: [5], terminal: 'completed' });
    expect(
      await MongoDurableSagaReservation.countDocuments({ ownerSagaId: 'mongo-engine-saga' })
    ).toBe(0);
    await expect(
      MongoDurableSagaInstance.exists({ sagaId: 'mongo-engine-saga', status: 'completed' })
    ).resolves.not.toBeNull();
  });
});
