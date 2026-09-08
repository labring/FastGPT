import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { MongoAIDefaultModel } from '@fastgpt/service/core/ai/defaultModel/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { SystemMigrationContext } from '@/migration/registry';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';
import { backfillDatasetModelReferences } from '@/migration/tasks/20260903_backfill_dataset_model_references';

/** 用真实测试数据库验证业务写入；Context 仅模拟框架持久化的断点和失败快照。 */
const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failures: SystemMigrationFailedRecord[] = [];
  const context = {
    migrationId: '20260903_backfill_dataset_model_references',
    runId: 'test-run',
    signal: new AbortController().signal,
    getCheckpoint: async (schema) =>
      checkpoint === undefined ? undefined : schema.parse(checkpoint),
    getFailedRecords: async () => failures,
    reportFailedRecords: vi.fn(async (records) => {
      failures = structuredClone(records);
    }),
    saveCheckpoint: vi.fn(async (value) => {
      checkpoint = structuredClone(value);
    }),
    reportProgress: vi.fn(async () => undefined),
    assertActive: vi.fn(async () => undefined),
    fail: async (error) => {
      throw new Error(error.message);
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
  return { context, getFailures: () => failures };
};

describe('backfillDatasetModelReferences', () => {
  const textId = new Types.ObjectId('600000000000000000000001');
  const visionId = new Types.ObjectId('600000000000000000000002');

  beforeEach(async () => {
    vi.restoreAllMocks();
    await MongoAIModel.deleteMany({});
    await MongoAIDefaultModel.deleteMany({});
    await MongoDataset.deleteMany({});
    await MongoAIModel.collection.insertMany([
      { _id: textId, scope: 'system', model: 'text', type: 'llm', isActive: true, config: {} },
      {
        _id: visionId,
        scope: 'system',
        model: 'vision',
        type: 'llm',
        isActive: true,
        config: { vision: true }
      }
    ]);
  });

  it('repairs legacy models, defaults missing text only, preserves vectors, and is idempotent', async () => {
    const brokenId = new Types.ObjectId();
    const emptyId = new Types.ObjectId();
    await MongoDataset.collection.insertMany([
      {
        _id: brokenId,
        agentModel: 'deleted-text',
        vlmModel: 'deleted-vision',
        vectorModel: 'original-embedding'
      },
      { _id: emptyId }
    ]);
    const state = createContext();
    expect(await backfillDatasetModelReferences(state.context)).toEqual({ processedCount: 2 });
    const repaired = await MongoDataset.collection.findOne({ _id: brokenId });
    expect(repaired).toMatchObject({
      agentModelId: String(textId),
      vlmModelId: String(visionId),
      vectorModel: 'original-embedding',
      agentModel: 'deleted-text',
      vlmModel: 'deleted-vision'
    });
    const empty = await MongoDataset.collection.findOne({ _id: emptyId });
    expect(empty).toHaveProperty('agentModelId', String(textId));
    expect(empty).not.toHaveProperty('vlmModelId');
    await backfillDatasetModelReferences(createContext().context);
    expect(await MongoDataset.collection.findOne({ _id: brokenId })).toEqual(repaired);
    expect(state.getFailures()).toEqual([]);
    expect(state.context.reportProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({ key: 'datasets', status: 'succeeded' })
    );
  });

  it.each([null, '', '  ', '\t\n'])(
    'uses shared empty semantics for old model values %j without replacing valid IDs',
    async (model) => {
      const missingId = new Types.ObjectId();
      const validId = new Types.ObjectId();
      const invalidId = new Types.ObjectId();
      await MongoDataset.collection.insertMany([
        { _id: missingId, agentModel: model, vlmModel: model },
        {
          _id: validId,
          agentModel: model,
          vlmModel: model,
          agentModelId: String(visionId),
          vlmModelId: String(visionId)
        },
        {
          _id: invalidId,
          agentModel: model,
          vlmModel: model,
          agentModelId: 'missing',
          vlmModelId: 'missing'
        }
      ]);
      await backfillDatasetModelReferences(createContext().context);
      const missing = await MongoDataset.collection.findOne({ _id: missingId });
      expect(missing).toHaveProperty('agentModelId', String(textId));
      expect(missing).not.toHaveProperty('vlmModelId');
      expect(await MongoDataset.collection.findOne({ _id: validId })).toMatchObject({
        agentModelId: String(visionId),
        vlmModelId: String(visionId)
      });
      expect(await MongoDataset.collection.findOne({ _id: invalidId })).toMatchObject({
        agentModelId: String(textId),
        vlmModelId: 'missing'
      });
    }
  );

  it('preserves valid vector IDs, repairs exact names, and never defaults unresolved vectors', async () => {
    const embeddingId = new Types.ObjectId();
    await MongoAIModel.collection.insertOne({
      _id: embeddingId,
      scope: 'system',
      model: 'embedding',
      type: 'embedding',
      isActive: true,
      config: {}
    });
    await MongoAIDefaultModel.collection.insertOne({
      scope: 'system',
      defaultModelIds: { embedding: String(embeddingId) }
    });
    const ids = Array.from({ length: 4 }, () => new Types.ObjectId());
    await MongoDataset.collection.insertMany([
      { _id: ids[0], vectorModelId: embeddingId, vectorModel: 'deleted' },
      { _id: ids[1], vectorModelId: String(textId), vectorModel: 'embedding' },
      { _id: ids[2], vectorModelId: 'missing', vectorModel: 'deleted' },
      { _id: ids[3] }
    ]);
    await backfillDatasetModelReferences(createContext().context);
    expect(await MongoDataset.collection.findOne({ _id: ids[0] })).toMatchObject({
      vectorModelId: embeddingId
    });
    expect(await MongoDataset.collection.findOne({ _id: ids[1] })).toMatchObject({
      vectorModelId: String(embeddingId)
    });
    expect(await MongoDataset.collection.findOne({ _id: ids[2] })).toMatchObject({
      vectorModelId: 'missing'
    });
    expect(await MongoDataset.collection.findOne({ _id: ids[3] })).not.toHaveProperty(
      'vectorModelId'
    );
  });

  it('allows empty model catalogs without fabricating IDs', async () => {
    await MongoAIModel.deleteMany({});
    const id = new Types.ObjectId();
    await MongoDataset.collection.insertOne({
      _id: id,
      agentModel: 'deleted',
      vlmModel: 'deleted'
    });
    await backfillDatasetModelReferences(createContext().context);
    const record = await MongoDataset.collection.findOne({ _id: id });
    expect(record).not.toHaveProperty('agentModelId');
    expect(record).not.toHaveProperty('vlmModelId');
  });

  it('safely replays writes when checkpoint persistence fails', async () => {
    const id = new Types.ObjectId();
    await MongoDataset.collection.insertOne({ _id: id, vlmModel: 'deleted' });
    const state = createContext();
    state.context.saveCheckpoint
      .mockImplementationOnce(async () => undefined)
      .mockImplementationOnce(async () => {
        throw new Error('checkpoint unavailable');
      });
    await expect(backfillDatasetModelReferences(state.context)).rejects.toThrow(
      'checkpoint unavailable'
    );
    const repaired = await MongoDataset.collection.findOne({ _id: id });
    await backfillDatasetModelReferences(state.context);
    expect(await MongoDataset.collection.findOne({ _id: id })).toEqual(repaired);
  });

  it('keeps CAS failures for retry without overwriting a concurrent model selection', async () => {
    const id = new Types.ObjectId();
    await MongoDataset.collection.insertOne({ _id: id, vlmModel: 'deleted' });
    const update = MongoDataset.updateOne.bind(MongoDataset);
    vi.spyOn(MongoDataset, 'updateOne').mockImplementationOnce((...args) => {
      return (async () => {
        await MongoDataset.collection.updateOne(
          { _id: id },
          { $set: { vlmModel: 'vision', vlmModelId: String(visionId) } }
        );
        return update(...args);
      })() as ReturnType<typeof MongoDataset.updateOne>;
    });
    const state = createContext();
    await expect(backfillDatasetModelReferences(state.context)).rejects.toThrow('1 records');
    expect(state.getFailures()).toHaveLength(1);
    expect(await MongoDataset.collection.findOne({ _id: id })).toMatchObject({
      vlmModel: 'vision',
      vlmModelId: String(visionId)
    });
    await backfillDatasetModelReferences(state.context);
    expect(state.getFailures()).toEqual([]);
  });

  it('does not write after losing the lease', async () => {
    const id = new Types.ObjectId();
    await MongoDataset.collection.insertOne({ _id: id, agentModel: 'deleted' });
    const state = createContext();
    state.context.assertActive.mockRejectedValue(new Error('lease lost'));
    await expect(backfillDatasetModelReferences(state.context)).rejects.toThrow('lease lost');
    expect(await MongoDataset.collection.findOne({ _id: id })).not.toHaveProperty('agentModelId');
  });
});
