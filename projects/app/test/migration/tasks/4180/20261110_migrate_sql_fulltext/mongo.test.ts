import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { mockGetVectors } from '@test/mocks/core/ai/embedding';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { getFullTextStore } from '@fastgpt/service/core/dataset/data/textStore';
import { mongoFullTextAdapter } from '@fastgpt/service/common/vectorDB/mongo/fullText';
import { MongoVectorCtrl } from '@fastgpt/service/common/vectorDB/mongo';
import { MongoDatasetDataEmbedding } from '@fastgpt/service/common/vectorDB/mongo/schema';
import { migrateSqlFullTextMigration } from '@/migration/tasks/4180/20261110_migrate_sql_fulltext';
import type { SystemMigrationContext } from '@/migration/registry';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';

const config = vi.hoisted(() => ({ compatibility: true }));
vi.mock('@fastgpt/service/env', async (original) => {
  const { serviceEnv, ...rest } = await original<typeof import('@fastgpt/service/env')>();
  return {
    ...rest,
    serviceEnv: {
      ...serviceEnv,
      get TMP_MIGRATE_FULL_TEXT() {
        return config.compatibility;
      }
    }
  };
});
vi.mock('@fastgpt/service/common/vectorDB/constants', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/common/vectorDB/constants')>()),
  getVectorType: () => 'mongo'
}));
// 真实 Mongo 文本索引和向量文档；本测试只替换独立连接与 mongot 的向量索引初始化。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()),
  getTeamModelHandle: async () => ({
    getModelData: () => ({ model: 'embedding-test', config: { maxToken: 8192 } })
  })
}));
vi.unmock('@fastgpt/service/common/vectorDB/mongo');
vi.mock('@fastgpt/service/common/vectorDB/mongo/controller', () => ({
  connectEmbeddingMongo: async () => undefined,
  initEmbeddingMongo: async () => undefined
}));
vi.mock('@fastgpt/service/common/vectorDB/mongo/schema', async (original) => {
  const schema = await original<typeof import('@fastgpt/service/common/vectorDB/mongo/schema')>();
  const { connectionMongo } = await import('@fastgpt/service/common/mongo');
  return {
    ...schema,
    embeddingMongo: connectionMongo,
    MongoDatasetDataEmbedding: connectionMongo.model(
      'MongoFullTextMigrationTest',
      schema.DatasetDataEmbeddingMongoSchema
    )
  };
});

const createContext = () => {
  let checkpoint: Record<string, unknown> | undefined;
  let failures: SystemMigrationFailedRecord[] = [];
  return {
    migrationId: '20261110_migrate_sql_fulltext',
    runId: randomUUID(),
    signal: new AbortController().signal,
    assertActive: async () => undefined,
    reportProgress: async () => undefined,
    getCheckpoint: async (schema) => checkpoint && schema.parse(checkpoint),
    saveCheckpoint: async (value) => {
      checkpoint = structuredClone(value);
    },
    getFailedRecords: async () => failures,
    reportFailedRecords: async (value) => {
      failures = value;
    },
    fail: async ({ message }) => {
      throw new Error(message);
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  } satisfies SystemMigrationContext;
};

const vector = [1, ...Array(1535).fill(0)];
const store = new MongoVectorCtrl();
const seed = async () => {
  const teamId = String(new Types.ObjectId());
  const datasetId = String(new Types.ObjectId());
  const collectionId = String(new Types.ObjectId());
  const vectorId = String(new Types.ObjectId());
  const scope = { teamId, datasetId, collectionId };
  await MongoDatasetDataEmbedding.create({
    _id: vectorId,
    ...scope,
    vector,
    createTime: new Date(),
    text: 'outdated input'
  });
  const data = await MongoDatasetData.create({
    ...scope,
    tmbId: new Types.ObjectId(),
    q: 'oldquestion',
    synonymVersion: 0,
    indexes: [{ dataId: vectorId, text: '数据库索引 constellation', type: 'custom' }]
  });
  const dataId = String(data._id);
  const query = { teamId, datasetIds: [datasetId], limit: 5, forbidCollectionIdList: [] };
  return { scope, vectorId, dataId, query };
};

beforeEach(() => {
  config.compatibility = true;
  expect(connectionMongo.connection.readyState).toBe(1);
});

describe('Mongo native full-text migration', () => {
  it('backfills legacy vector documents from index.text, switches reads, and follows new vector writes and deletes', async () => {
    const { scope, vectorId, dataId, query } = await seed();
    const fullText = getFullTextStore();
    await fullText.write([{ ...scope, dataId, fullText: 'oldquestion' }]);
    expect(await fullText.search({ ...query, query: 'oldquestion' })).toMatchObject([{ dataId }]);

    const migration = createContext();
    expect(await migrateSqlFullTextMigration(migration)).toMatchObject({
      provider: 'mongo',
      scanned: 1,
      validated: 1
    });
    expect(await migrateSqlFullTextMigration(migration)).toMatchObject({
      provider: 'mongo',
      scanned: 1,
      validated: 1
    });
    expect(await MongoDatasetDataEmbedding.findById(vectorId).lean()).toMatchObject({
      _id: vectorId,
      vector,
      text: 'outdated input',
      fulltextTokens: expect.stringContaining('constellation')
    });

    config.compatibility = false;
    expect(await fullText.search({ ...query, query: '数据库' })).toMatchObject([{ dataId }]);
    expect(await fullText.search({ ...query, query: 'oldquestion' })).toEqual([]);
    expect(
      await fullText.search({
        ...query,
        query: 'constellation',
        forbidCollectionIdList: [scope.collectionId]
      })
    ).toEqual([]);

    const {
      insertIds: [newId]
    } = await store.insert({ ...scope, vectors: [vector], texts: ['replacementword'] });
    // SQL/Mongo 原生读取都只能召回业务主库当前引用，旧向量尚未删除也不会命中。
    await MongoDatasetData.updateOne(
      { _id: dataId },
      { $set: { 'indexes.0.dataId': newId, 'indexes.0.text': 'replacementword' } }
    );
    expect(await fullText.search({ ...query, query: 'constellation' })).toEqual([]);
    expect(await fullText.search({ ...query, query: 'replacementword' })).toMatchObject([
      { dataId }
    ]);
    await store.delete({ teamId: scope.teamId, id: newId });
    expect(await fullText.search({ ...query, query: 'replacementword' })).toEqual([]);
  });

  it('rebuilds a missing Mongo vector with tokens and replaces its reference', async () => {
    const { scope, vectorId, dataId, query } = await seed();
    await MongoDataset.create({
      _id: scope.datasetId,
      teamId: scope.teamId,
      tmbId: new Types.ObjectId(),
      name: 'Mongo vector repair',
      vectorModel: 'embedding-test'
    });
    await store.delete({ teamId: scope.teamId, id: vectorId });
    mockGetVectors.mockClear();
    const context = createContext();
    await migrateSqlFullTextMigration(context);
    const repaired = await MongoDatasetData.findById(dataId).lean();
    const newId = repaired?.indexes[0].dataId;
    expect(newId).toMatch(/^[a-f0-9]{24}$/);
    expect(newId).not.toBe(vectorId);
    expect(await MongoDatasetDataEmbedding.findById(newId).lean()).toMatchObject({
      fulltextTokens: expect.stringContaining('constellation'),
      vector: expect.arrayContaining([expect.any(Number)])
    });
    config.compatibility = false;
    expect(await getFullTextStore().search({ ...query, query: 'constellation' })).toMatchObject([
      { dataId }
    ]);
    await migrateSqlFullTextMigration(context);
    expect(mockGetVectors).toHaveBeenCalledOnce();
  });

  it('rejects existing-row conflicts without overwriting them or treating them as missing vectors', async () => {
    const { scope, vectorId, dataId } = await seed();
    await MongoDatasetDataEmbedding.updateOne(
      { _id: vectorId },
      { $set: { fulltextTokens: 'conflict' } }
    );
    const migration = createContext();
    await expect(migrateSqlFullTextMigration(migration)).rejects.toThrow('unresolved');
    expect(await migration.getFailedRecords()).toMatchObject([
      { data: { id: dataId }, stageKey: 'scan' }
    ]);
    expect(
      await mongoFullTextAdapter.fill([
        { ...scope, teamId: 'another-team', vectorId, text: 'conflict' }
      ])
    ).toEqual([vectorId]);
    expect(await mongoFullTextAdapter.findMissingVectorIds([vectorId])).toEqual([]);
    expect(await MongoDatasetDataEmbedding.findById(vectorId).lean()).toMatchObject({
      fulltextTokens: 'conflict'
    });
  });
});
