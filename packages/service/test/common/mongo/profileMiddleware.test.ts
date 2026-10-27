import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const profilingMocks = vi.hoisted(() => ({
  isProfiling: vi.fn(),
  recordMongoOperation: vi.fn()
}));

vi.mock('@fastgpt/service/common/profiling', () => profilingMocks);

type TestMongoRecord = {
  name: string;
};

let getMongoModel: typeof import('@fastgpt/service/common/mongo').getMongoModel;
let Schema: typeof import('@fastgpt/service/common/mongo').Schema;

const getPostHooks = (schema: InstanceType<typeof Schema>, name: string) =>
  ((schema as any).s.hooks._posts.get(name) ?? []) as Array<{ fn: (...args: any[]) => unknown }>;

const createModel = () => {
  const schema = new Schema<TestMongoRecord>({ name: String });
  const model = getMongoModel<TestMongoRecord>(`MongoProfile${randomUUID()}`, schema);
  return { schema, model };
};

describe('Mongo profile middleware', () => {
  beforeAll(async () => {
    // common/mongo is loaded by the test setup before this file installs its mock.
    vi.resetModules();
    ({ getMongoModel, Schema } = await import('@fastgpt/service/common/mongo'));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    profilingMocks.isProfiling.mockReturnValue(true);
  });

  it('records a successful query with its collection name', () => {
    const { schema, model } = createModel();
    const [successHook] = getPostHooks(schema, 'find');
    const next = vi.fn();

    successHook.fn.call(
      {
        model,
        _startTime: Date.now() - 2,
        _query: { name: 'query' }
      },
      [],
      next
    );

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledWith({
      collectionName: model.collection.name,
      durationMs: expect.any(Number)
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('records a failed query and passes the original error through', () => {
    const { schema, model } = createModel();
    const errorHook = getPostHooks(schema, 'find')[1];
    const error = new Error('query failed');
    const next = vi.fn();

    errorHook.fn.call(
      {
        model,
        _startTime: Date.now() - 3,
        _query: { name: 'query' }
      },
      error,
      [],
      next
    );

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledWith({
      collectionName: model.collection.name,
      durationMs: expect.any(Number)
    });
    expect(next).toHaveBeenCalledWith(error);
  });

  it('resolves the collection name from document save hooks', () => {
    const { schema, model } = createModel();
    const document = new model({ name: 'save' });
    const [successHook] = getPostHooks(schema, 'save');
    const next = vi.fn();

    (document as any)._startTime = Date.now() - 2;
    successHook.fn.call(document, document, next);

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledWith({
      collectionName: model.collection.name,
      durationMs: expect.any(Number)
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('resolves the collection name from model-level create hooks', () => {
    const { schema, model } = createModel();
    const [successHook] = getPostHooks(schema, 'create');
    const next = vi.fn();

    (model as any)._startTime = Date.now() - 2;
    successHook.fn.call(model, [], next);

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledWith({
      collectionName: model.collection.name,
      durationMs: expect.any(Number)
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('records save:error failures without swallowing the error', () => {
    const { schema, model } = createModel();
    const document = new model({ name: 'save' });
    const [errorHook] = getPostHooks(schema, 'save:error');
    const error = new Error('save failed');
    const next = vi.fn();

    (document as any)._startTime = Date.now() - 4;
    errorHook.fn.call(document, error, document, next);

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledWith({
      collectionName: model.collection.name,
      durationMs: expect.any(Number)
    });
    expect(next).toHaveBeenCalledWith(error);
  });

  it('does not record when profiling is disabled', () => {
    const { schema, model } = createModel();
    const [successHook] = getPostHooks(schema, 'find');

    profilingMocks.isProfiling.mockReturnValue(false);
    successHook.fn.call({ model, _startTime: Date.now() }, [], vi.fn());

    expect(profilingMocks.recordMongoOperation).not.toHaveBeenCalled();
  });

  it('records real create and query operations with collection names', async () => {
    const { model } = createModel();
    const name = `profile-${randomUUID()}`;

    await model.create({ name });

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: model.collection.name,
        durationMs: expect.any(Number)
      })
    );

    profilingMocks.recordMongoOperation.mockClear();
    await model.findOne({ name }).lean();

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: model.collection.name,
        durationMs: expect.any(Number)
      })
    );
  });

  it('records a real failed query with its collection name', async () => {
    const { model } = createModel();

    await expect(model.find({ $expr: { $invalidProfileOperator: 1 } }).lean()).rejects.toThrow();

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: model.collection.name,
        durationMs: expect.any(Number)
      })
    );
  });
});
