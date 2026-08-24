import { Types } from '@fastgpt/service/common/mongo';
import { beforeAll, describe, expect, test, vi } from 'vitest';

// Unmock vector controllers + constants for integration tests
vi.unmock('@fastgpt/service/common/vectorDB/milvus');
vi.unmock('@fastgpt/service/common/vectorDB/constants');

import { MilvusCtrl } from '@fastgpt/service/common/vectorDB/milvus';
import { getMilvusFullTextStore } from '@fastgpt/service/common/vectorDB/milvus/fullText';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { TEST_VECTORS } from '../testData';

// 全文后端跟随实际向量库:provider=milvus 时恒为 BM25(modeldata_v2 单表),无独立引擎开关
// 注:Milvus 最低版本 2.5(推荐 2.5.16+)由应用启动版本门禁保证,集成环境需用受支持版本
const isEnabled = Boolean(process.env.MILVUS_ADDRESS);

describe.skipIf(!isEnabled)('Milvus FullText Integration', () => {
  const ctrl = new MilvusCtrl();
  const store = getMilvusFullTextStore();

  const FULLTEXT_TERM = 'integration';

  // 写入一条向量(text 随行)并落一条 dataset_data 反查记录(indexes.dataId = 向量 id)
  const insertFullTextRow = async (overrides: { teamId?: string; datasetId?: string } = {}) => {
    const teamId = overrides.teamId ?? new Types.ObjectId().toString();
    const datasetId = overrides.datasetId ?? new Types.ObjectId().toString();
    const collectionId = new Types.ObjectId().toString();
    const tmbId = new Types.ObjectId().toString();
    const text = `fastgpt bm25 ${FULLTEXT_TERM} search`;

    const { insertIds } = await ctrl.insert({
      teamId,
      datasetId,
      collectionId,
      vectors: [TEST_VECTORS[0]],
      texts: [text]
    });

    const doc = await MongoDatasetData.create({
      teamId,
      tmbId,
      datasetId,
      collectionId,
      q: text,
      indexes: [{ dataId: insertIds[0], text }]
    });

    return { teamId, datasetId, collectionId, insertIds, doc };
  };

  // 等待 Milvus 对刚写入的 growing segment 建立 sparse 索引并可见
  const waitVisible = (ms = 800) => new Promise((r) => setTimeout(r, ms));

  beforeAll(async () => {
    await ctrl.init();
  });

  test('TC-FT-1 BM25 search returns matching data via reverse lookup', async () => {
    const ctx = await insertFullTextRow();
    await waitVisible();

    const results = await store.search({
      teamId: ctx.teamId,
      datasetIds: [ctx.datasetId],
      query: FULLTEXT_TERM,
      limit: 1,
      forbidCollectionIdList: []
    });

    expect(results).toHaveLength(1);
    expect(results[0].dataId).toBe(String(ctx.doc._id));
    expect(results[0].collectionId).toBe(ctx.collectionId);

    await ctrl.delete({ teamId: ctx.teamId, datasetIds: [ctx.datasetId] });
  });

  test('TC-FT-2 filterCollectionIdList narrows results to that collection', async () => {
    // 同一 team/dataset 下两条数据,分属不同 collection
    const teamId = new Types.ObjectId().toString();
    const datasetId = new Types.ObjectId().toString();
    const rowA = await insertFullTextRow({ teamId, datasetId });
    const rowB = await insertFullTextRow({ teamId, datasetId });
    await waitVisible();

    const results = await store.search({
      teamId,
      datasetIds: [datasetId],
      query: FULLTEXT_TERM,
      limit: 10,
      forbidCollectionIdList: [],
      filterCollectionIdList: [rowA.collectionId]
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.collectionId === rowA.collectionId)).toBe(true);

    await ctrl.delete({ teamId, datasetIds: [datasetId] });
  });

  test('TC-FT-3 non-matching query returns empty', async () => {
    const ctx = await insertFullTextRow();
    await waitVisible();

    const results = await store.search({
      teamId: ctx.teamId,
      datasetIds: [ctx.datasetId],
      query: 'zzz_nonexistent_term_qqq',
      limit: 10,
      forbidCollectionIdList: []
    });

    expect(results).toEqual([]);

    await ctrl.delete({ teamId: ctx.teamId, datasetIds: [ctx.datasetId] });
  });
});
