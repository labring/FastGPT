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

  it('resolves the collection name from model-level create hooks', async () => {
    const { model } = createModel();

    await model.create([{ name: `create-${randomUUID()}` }]);

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionName: model.collection.name,
        durationMs: expect.any(Number)
      })
    );
  });

  it('records concurrent insertMany calls separately', async () => {
    const { model } = createModel();

    await Promise.all([
      model.insertMany([{ name: `a-${randomUUID()}` }]),
      model.insertMany([{ name: `b-${randomUUID()}` }])
    ]);

    // Model middleware 的 this 是共享构造函数，两次并发都必须各记一次。
    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledTimes(2);
  });

  it('attributes out-of-order insertMany durations to the correct call', async () => {
    const { model } = createModel();
    const gates: Record<string, () => Promise<unknown>> = {};
    const originalInsertMany = model.collection.insertMany.bind(model.collection);

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    vi.spyOn(model.collection, 'insertMany').mockImplementation(
      (docs: any, options: any) =>
        new Promise((resolve, reject) => {
          gates[String(docs[0].name)] = () =>
            originalInsertMany(docs, options).then(resolve, reject);
        })
    );

    const waitForGate = async (name: string) => {
      for (let i = 0; i < 50 && !gates[name]; i++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      expect(gates[name]).toBeDefined();
    };

    const slow = model.insertMany([{ name: 'slow' }]);
    await waitForGate('slow');

    nowSpy.mockReturnValue(2500);
    const fast = model.insertMany([{ name: 'fast' }]);
    await waitForGate('fast');

    // fast 后开始、先完成；slow 先开始、后完成。
    nowSpy.mockReturnValue(2600);
    await gates.fast();
    nowSpy.mockReturnValue(3500);
    await gates.slow();

    await Promise.all([slow, fast]);
    nowSpy.mockRestore();

    const durations = profilingMocks.recordMongoOperation.mock.calls.map(([arg]) => arg.durationMs);

    expect(durations).toHaveLength(2);
    // 完成顺序是 fast、slow，耗时必须各自对应自己的起点。
    expect(durations[0]).toBe(100);
    expect(durations[1]).toBe(2500);
  });

  it('does not reuse a previous Document timer when a later save fails validation', async () => {
    const schema = new Schema<TestMongoRecord>({ name: { type: String, required: true } });
    const model = getMongoModel<TestMongoRecord>(`MongoProfileDocReuse${randomUUID()}`, schema);
    const document = new model({ name: 'valid' });

    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1000);
    await document.save();
    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledTimes(1);

    profilingMocks.recordMongoOperation.mockClear();

    // required 校验由 Mongoose 内置 pre hook 执行，先于计时 pre hook；错误 post hook 仍会触发。
    nowSpy.mockReturnValue(6000);
    document.name = undefined as any;
    await expect(document.save()).rejects.toThrow();

    // 没有执行本次计时 pre hook，就不能消费上一次保存的起点。
    expect(profilingMocks.recordMongoOperation).not.toHaveBeenCalled();
    nowSpy.mockRestore();
  });

  it('records concurrent failed insertMany calls separately', async () => {
    const { model } = createModel();
    const insertSpy = vi
      .spyOn(model.collection, 'insertMany')
      .mockRejectedValue(new Error('insertMany failed'));

    await expect(
      Promise.all([
        model.insertMany([{ name: 'a' }]).catch((error) => error),
        model.insertMany([{ name: 'b' }]).catch((error) => error)
      ])
    ).resolves.toHaveLength(2);

    insertSpy.mockRestore();

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledTimes(2);
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

  it('records a real successful save exactly once', async () => {
    const { model } = createModel();

    await model.create({ name: `ok-${randomUUID()}` });

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledTimes(1);
  });

  it('records a real failed save exactly once', async () => {
    const { model } = createModel();
    const insertSpy = vi
      .spyOn(model.collection, 'insertOne')
      .mockRejectedValue(new Error('insert failed'));

    await expect(model.create({ name: 'failed-save' })).rejects.toThrow();

    insertSpy.mockRestore();

    expect(profilingMocks.recordMongoOperation).toHaveBeenCalledTimes(1);
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
