import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { connectionMongo, Types } from '@fastgpt/service/common/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { mockGetVectors } from '@test/mocks/core/ai/embedding';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { getFullTextStore } from '@fastgpt/service/core/dataset/data/textStore';
import { mongoFullTextAdapter } from '@fastgpt/service/common/vectorDB/mongo/fullText';
import { MongoVectorCtrl } from '@fastgpt/service/common/vectorDB/mongo';
import {
  connectEmbeddingMongo,
  initEmbeddingMongo
} from '@fastgpt/service/common/vectorDB/mongo/controller';
import {
  embeddingMongo,
  MongoDatasetDataEmbedding
} from '@fastgpt/service/common/vectorDB/mongo/schema';
import { migrateSqlFullTextMigration } from '@/migration/tasks/4180/20261110_migrate_sql_fulltext';
import type { SystemMigrationContext } from '@/migration/registry';
import type { SystemMigrationFailedRecord } from '@fastgpt/global/migration/schema';

const config = vi.hoisted(() => {
  const endpoint = process.env.FASTGPT_MONGO_FULLTEXT_TEST_URL;
  if (!endpoint) return { compatibility: true };
  const url = new URL(endpoint);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Mongo full-text integration tests require an isolated loopback endpoint');
  }
  url.pathname = `/fastgpt_test_mongo_fulltext_${process.pid}_${Date.now()}`;
  return { compatibility: true, searchUrl: url.toString() };
});
vi.mock('@fastgpt/service/env', async (original) => {
  const { serviceEnv, ...rest } = await original<typeof import('@fastgpt/service/env')>();
  return {
    ...rest,
    serviceEnv: {
      ...serviceEnv,
      SEARCH_MONGO_URL: config.searchUrl,
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
// 搜索索引、向量文档和迁移事务均使用真实数据库；补向量使用固定测试模型。
vi.unmock('@fastgpt/service/common/mongo/sessionRun');
vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (original) => ({
  ...(await original<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()),
  getTeamModelHandle: async () => ({
    getModelData: () => ({ model: 'embedding-test', config: { maxToken: 8192 } })
  })
}));
vi.unmock('@fastgpt/service/common/vectorDB/mongo');

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

describe.skipIf(!config.searchUrl)('Mongo native full-text migration', () => {
  beforeAll(async () => {
    await connectEmbeddingMongo();
    // 预览版的普通文本索引在滚动升级期间仍可供旧节点使用。
    await MongoDatasetDataEmbedding.collection.createIndex(
      { teamId: 1, datasetId: 1, fulltextTokens: 'text' },
      { name: 'embedding_fulltext', default_language: 'none' }
    );
    await initEmbeddingMongo();
  }, 200_000);

  beforeEach(() => {
    config.compatibility = true;
    expect(connectionMongo.connection.readyState).toBe(1);
  });

  afterAll(async () => {
    await embeddingMongo.connection.db?.dropDatabase();
    await embeddingMongo.disconnect();
  });

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
    await expect
      .poll(() => fullText.search({ ...query, query: 'replacementword' }), { timeout: 10_000 })
      .toMatchObject([{ dataId }]);
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

  it('searches multiple datasets and applies the current collection scope before top K', async () => {
    const teamId = String(new Types.ObjectId());
    const left = String(new Types.ObjectId());
    const right = String(new Types.ObjectId());
    const forbidden = String(new Types.ObjectId());
    await store.insert({
      teamId,
      datasetId: left,
      collectionId: left,
      vectors: [vector],
      texts: ['scopeword scopeword scopeword']
    });
    const {
      insertIds: [rightId]
    } = await store.insert({
      teamId,
      datasetId: right,
      collectionId: right,
      vectors: [vector],
      texts: ['scopeword']
    });
    const query = {
      teamId,
      datasetIds: [left, right],
      query: 'scopeword',
      limit: 3,
      forbidCollectionIdList: [forbidden]
    };
    await expect
      .poll(() => mongoFullTextAdapter.search(query), { timeout: 10_000 })
      .toHaveLength(2);
    await MongoDatasetDataEmbedding.updateOne(
      { teamId, datasetId: left },
      { $set: { collectionId: forbidden } }
    );
    expect(await mongoFullTextAdapter.search({ ...query, limit: 1 })).toMatchObject([
      { vectorId: rightId, collectionId: right }
    ]);
    expect((await MongoDatasetDataEmbedding.listIndexes()).map(({ name }) => name)).toContain(
      'embedding_fulltext'
    );
  });
});
