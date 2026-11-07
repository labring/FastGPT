import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

import { MongoAIModel } from '@fastgpt/service/core/ai/model/schema';
import { MongoAIModelCatalog } from '@fastgpt/service/core/ai/model/catalog/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import {
  findSystemDefaultModelIds,
  upsertSystemDefaultModelIds,
  readModelCatalogRevision,
  readModelCatalogSnapshot
} from '@fastgpt/service/core/ai/model/catalog/entity';
import { runModelTransaction } from '@fastgpt/service/core/ai/model/catalog/transaction';

// setup 已载入无事务 mock；修改同一 mock 函数的实现，让本文件使用真实 replica-set 事务。
beforeAll(async () => {
  const { mongoSessionRun: actualMongoSessionRun } = await vi.importActual<
    typeof import('@fastgpt/service/common/mongo/sessionRun')
  >('@fastgpt/service/common/mongo/sessionRun');
  vi.mocked(mongoSessionRun).mockImplementation(actualMongoSessionRun);
});

const modelData = {
  scope: ModelScopeEnum.system,
  type: ModelTypeEnum.llm,
  provider: 'OpenAI',
  model: 'transaction-model',
  name: 'Transaction model',
  isActive: true,
  config: { maxContext: 16000, maxResponse: 8000, quoteMaxToken: 12000 }
};

beforeEach(async () => {
  await Promise.all([MongoAIModel.deleteMany({}), MongoAIModelCatalog.deleteMany({})]);
});

describe('readModelCatalogRevision', () => {
  it('uses revision zero for an empty catalog and historical records without a revision', async () => {
    await expect(readModelCatalogRevision({ scope: ModelScopeEnum.system })).resolves.toBe(0);
    await MongoAIModelCatalog.collection.insertOne({
      scope: ModelScopeEnum.system,
      defaultModelIds: {}
    });

    await expect(readModelCatalogRevision({ scope: ModelScopeEnum.system })).resolves.toBe(0);
    await runModelTransaction({ scope: ModelScopeEnum.system }, async () => 'migrated');
    await expect(readModelCatalogRevision({ scope: ModelScopeEnum.system })).resolves.toBe(1);
  });
});

describe('readModelCatalogSnapshot', () => {
  it('returns empty defaults and revision zero when no catalog exists', async () => {
    await expect(readModelCatalogSnapshot({ scope: ModelScopeEnum.system })).resolves.toEqual({
      models: [],
      defaultModelIds: {},
      revision: 0
    });
  });

  it('orders models newest first and strictly excludes team models from system snapshot', async () => {
    const sampleTmbId = '68ad85a7463006c963799a05';
    await MongoAIModel.create([
      { ...modelData, model: 'first' },
      { ...modelData, model: 'second' },
      { ...modelData, scope: ModelScopeEnum.team, tmbId: sampleTmbId, model: 'team-only' }
    ]);

    const found = await MongoAIModel.findOne({ scope: ModelScopeEnum.team, tmbId: sampleTmbId });
    expect(found).toBeDefined();

    const snapshot = await readModelCatalogSnapshot({ scope: ModelScopeEnum.system });

    expect(snapshot.models.map(({ model }) => model)).toEqual(['second', 'first']);
    expect(snapshot.models.some(({ model }) => model === 'team-only')).toBe(false);
    expect(snapshot.defaultModelIds).toEqual({});
    expect(snapshot.revision).toBe(0);
  });

  it('does not expose in-flight data with the uncommitted revision', async () => {
    const model = await MongoAIModel.create(modelData);
    await MongoAIModelCatalog.create({ scope: ModelScopeEnum.system, catalogRevision: 4 });

    await runModelTransaction({ scope: ModelScopeEnum.system }, async (session) => {
      await MongoAIModel.updateOne(
        { _id: model._id },
        { $set: { name: 'Committed name' } },
        { session }
      );
      await MongoAIModelCatalog.updateOne(
        { scope: ModelScopeEnum.system },
        { $set: { defaultModelIds: { llm: String(model._id) } } },
        { session }
      );

      // 独立读事务在写事务提交前只能看到完整的旧目录。
      await expect(
        readModelCatalogSnapshot({ scope: ModelScopeEnum.system })
      ).resolves.toMatchObject({
        models: [{ name: modelData.name }],
        defaultModelIds: {},
        revision: 4
      });
    });

    await expect(readModelCatalogSnapshot({ scope: ModelScopeEnum.system })).resolves.toMatchObject(
      {
        models: [{ name: 'Committed name' }],
        defaultModelIds: { llm: String(model._id) },
        revision: 5
      }
    );
  });

  it('rejects invalid persisted default identifiers instead of publishing a partial snapshot', async () => {
    await MongoAIModelCatalog.collection.insertOne({
      scope: ModelScopeEnum.system,
      catalogRevision: 1,
      defaultModelIds: { llm: 123 }
    });

    await expect(readModelCatalogSnapshot({ scope: ModelScopeEnum.system })).rejects.toThrow();
  });

  it('serializes concurrent commits without losing revisions or model updates', async () => {
    // 预建单例，将用例聚焦在目录写冲突重试，而非集合/索引初始化竞态。
    await MongoAIModelCatalog.create({ scope: ModelScopeEnum.system, catalogRevision: 0 });

    await Promise.all(
      ['model-a', 'model-b', 'model-c'].map((model) =>
        runModelTransaction({ scope: ModelScopeEnum.system }, async (session) => {
          await MongoAIModel.create([{ ...modelData, model }], { session });
        })
      )
    );

    await expect(readModelCatalogRevision({ scope: ModelScopeEnum.system })).resolves.toBe(3);
    const snapshot = await readModelCatalogSnapshot({ scope: ModelScopeEnum.system });
    expect(snapshot.revision).toBe(3);
    expect(snapshot.models.map(({ model }) => model).sort()).toEqual([
      'model-a',
      'model-b',
      'model-c'
    ]);
  });
});

describe('system default slots in catalog', () => {
  it('returns an empty configuration before system defaults are configured', async () => {
    await expect(findSystemDefaultModelIds()).resolves.toEqual({});
  });

  it('upserts the only system-scoped default record', async () => {
    await upsertSystemDefaultModelIds({ llm: 'llm-1', datasetImageLLM: 'vision-1' });
    await upsertSystemDefaultModelIds({
      llm: 'llm-2',
      embedding: 'embedding-1',
      datasetImageLLM: undefined
    });

    await expect(
      MongoAIModelCatalog.countDocuments({ scope: ModelScopeEnum.system })
    ).resolves.toBe(1);
    await expect(findSystemDefaultModelIds()).resolves.toEqual({
      llm: 'llm-2',
      embedding: 'embedding-1'
    });
  });

  it('enforces one physical document for the system scope', async () => {
    await MongoAIModelCatalog.create({ scope: ModelScopeEnum.system, defaultModelIds: {} });

    await expect(
      MongoAIModelCatalog.create({ scope: ModelScopeEnum.system, defaultModelIds: {} })
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('requires an owner team for a team-scoped catalog record', async () => {
    await expect(
      MongoAIModelCatalog.create({ scope: ModelScopeEnum.team, defaultModelIds: {} })
    ).rejects.toThrow('teamId');
  });
});
