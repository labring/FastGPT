import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { Model } from 'mongoose';
import type { DatasetDataEmbedding } from '@fastgpt/global/core/dataset/data/embedding/type';
import { createTestIds, TEST_COLLECTION_IDS, VECTOR_DIM } from '../testData';

// Unmock vector controllers for integration tests
vi.unmock('@fastgpt/service/common/vectorDB/mongo');
vi.unmock('@fastgpt/service/common/vectorDB/constants');

import { MongoVectorCtrl } from '@fastgpt/service/common/vectorDB/mongo';
import { connectEmbeddingMongo } from '@fastgpt/service/common/vectorDB/mongo/controller';
import {
  DatasetDataEmbeddingMongoSchema,
  embeddingMongo
} from '@fastgpt/service/common/vectorDB/mongo/schema';

const isEnabled = Boolean(process.env.SEARCH_MONGO_URL);

const createUnitVector = (leading: number[]) => {
  const norm = Math.hypot(...leading);
  return [...leading.map((value) => value / norm), ...Array(VECTOR_DIM - leading.length).fill(0)];
};

const UNIT_QUERY_VECTOR = createUnitVector([1, 0, 0]);
const UNIT_TEST_VECTORS = [
  createUnitVector([1, 0, 0]),
  createUnitVector([0.8, 0.6, 0]),
  createUnitVector([0.6, 0, 0.8])
];

describe.skipIf(!isEnabled)('Mongo Vector Integration', () => {
  describe.sequential('exact $similarityDotProduct rescoring (MongoDB 8.3+)', () => {
    const rescoreCollectionName = `mongo_embedding_rescore_test_${Date.now()}`;
    const unitAxis = [1, ...Array(VECTOR_DIM - 1).fill(0)];
    let rescoreModel: Model<DatasetDataEmbedding>;

    beforeAll(async () => {
      await connectEmbeddingMongo();
      rescoreModel =
        embeddingMongo.models[rescoreCollectionName] ??
        embeddingMongo.model<DatasetDataEmbedding>(
          rescoreCollectionName,
          DatasetDataEmbeddingMongoSchema,
          rescoreCollectionName
        );
    });

    beforeEach(async () => {
      vi.restoreAllMocks();
      await rescoreModel.deleteMany({});
    });

    afterAll(async () => {
      await rescoreModel?.collection.drop().catch(() => undefined);
    });

    test('pre-filters scopes and rescores, orders and truncates candidates by exact dot product', async () => {
      const controller = new MongoVectorCtrl(rescoreModel);
      vi.spyOn(controller, 'init').mockResolvedValue(undefined);
      const queryVector = [0.6, 0.8, ...Array(VECTOR_DIM - 2).fill(0)];
      // 保留 Schema 外的模拟近似分数，确保未执行精排时无法误通过断言。
      await rescoreModel.insertMany(
        [
          { _id: 'low', vector: [0, -1, ...Array(VECTOR_DIM - 2).fill(0)], score: 0.99 },
          { _id: 'tie-a', vector: unitAxis, score: 0.98 },
          { _id: 'tie-Z', vector: unitAxis, score: 0.97 },
          { _id: 'tie-2', vector: unitAxis, score: 0.965 },
          { _id: 'tie-10', vector: unitAxis, score: 0.96 },
          { _id: 'tie-\uE000', vector: unitAxis, score: 0.955 },
          { _id: 'tie-\u{10000}', vector: unitAxis, score: 0.95 },
          { _id: 'best', vector: queryVector, score: 0.95 }
        ].map((candidate) => ({
          ...candidate,
          teamId: 'team',
          datasetId: 'dataset',
          collectionId: 'allowed',
          createTime: new Date()
        })),
        { lean: true }
      );

      // 只替代依赖 mongot 的首阶段；原始内积、排序和截断交给真实 MongoDB 8.3+ 执行。
      const aggregateCandidates = rescoreModel.aggregate.bind(rescoreModel);
      vi.spyOn(rescoreModel, 'aggregate').mockImplementation((pipeline = []) =>
        aggregateCandidates([{ $sort: { score: -1 } }, ...pipeline.slice(1)])
      );
      const result = await controller.embRecall({
        teamId: 'team',
        datasetIds: ['dataset'],
        vector: queryVector,
        limit: 7,
        hnswEfSearch: 200,
        forbidCollectionIdList: ['denied'],
        filterCollectionIdList: ['allowed', 'denied']
      });
      expect(result.results).toEqual([
        { id: 'best', collectionId: 'allowed', score: 1 },
        { id: 'tie-10', collectionId: 'allowed', score: 0.6 },
        { id: 'tie-2', collectionId: 'allowed', score: 0.6 },
        { id: 'tie-Z', collectionId: 'allowed', score: 0.6 },
        { id: 'tie-a', collectionId: 'allowed', score: 0.6 },
        { id: 'tie-\uE000', collectionId: 'allowed', score: 0.6 },
        { id: 'tie-\u{10000}', collectionId: 'allowed', score: 0.6 }
      ]);
    });

    test('keeps raw negative and near-zero dot products without score normalization', async () => {
      const controller = new MongoVectorCtrl(rescoreModel);
      vi.spyOn(controller, 'init').mockResolvedValue(undefined);
      const queryVector = [Math.SQRT1_2, 1e-17, -Math.SQRT1_2, ...Array(VECTOR_DIM - 3).fill(0)];
      const third = 1 / Math.sqrt(3);
      await rescoreModel.insertMany(
        [
          { _id: 'cancel', vector: [third, third, third, ...Array(VECTOR_DIM - 3).fill(0)] },
          { _id: 'tiny', vector: [0, 1, ...Array(VECTOR_DIM - 2).fill(0)] },
          { _id: 'negative', vector: queryVector.map((value) => -value) },
          { _id: 'best', vector: queryVector }
        ].map((candidate) => ({
          ...candidate,
          teamId: 'a',
          datasetId: 'd',
          collectionId: 'c',
          createTime: new Date()
        }))
      );
      const aggregateCandidates = rescoreModel.aggregate.bind(rescoreModel);
      vi.spyOn(rescoreModel, 'aggregate').mockImplementation((pipeline = []) =>
        aggregateCandidates(pipeline.slice(1))
      );
      const { results } = await controller.embRecall({
        teamId: 'a',
        datasetIds: ['d'],
        vector: queryVector,
        limit: 4,
        hnswEfSearch: 200,
        forbidCollectionIdList: []
      });
      expect(results.map(({ id }) => id)).toEqual(['best', 'tiny', 'cancel', 'negative']);
      expect(results[1].score).toBe(1e-17);
      expect(results[2].score).toBeCloseTo(0, 15);
      expect(results[0].score).toBeCloseTo(1, 15);
      expect(results[3].score).toBeCloseTo(-1, 15);
    });
  });

  describe.sequential('vectorDB end-to-end (MongoDB 8.3+ & mongot)', () => {
    const vectorCtrl = new MongoVectorCtrl();

    const insertTestVectors = async (teamId: string, datasetId: string) => {
      const insertIds: string[] = [];
      for (const [index, vector] of UNIT_TEST_VECTORS.entries()) {
        const { insertIds: ids } = await vectorCtrl.insert({
          teamId,
          datasetId,
          collectionId: TEST_COLLECTION_IDS[index],
          vectors: [vector],
          texts: [`integration-test-${index}`]
        });
        insertIds.push(ids[0]);
      }
      // mongot 异步同步向量索引，短暂等待后执行检索验证。
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return insertIds;
    };

    beforeAll(async () => {
      await vectorCtrl.init();
    });

    test('inserts, counts, recalls with collection filters, scans by time and deletes', async () => {
      const { teamId, datasetId } = createTestIds();
      const start = new Date();
      try {
        const insertIds = await insertTestVectors(teamId, datasetId);
        expect(insertIds).toHaveLength(UNIT_TEST_VECTORS.length);
        expect(await vectorCtrl.getVectorCount({ teamId, datasetId })).toBe(
          UNIT_TEST_VECTORS.length
        );

        const recalled = await vectorCtrl.embRecall({
          teamId,
          datasetIds: [datasetId],
          vector: UNIT_QUERY_VECTOR,
          limit: 3,
          hnswEfSearch: 200,
          forbidCollectionIdList: []
        });
        expect(recalled.results.map(({ id }) => id)).toEqual(insertIds);
        expect(recalled.results[0].score).toBeCloseTo(1, 12);

        const forbidden = await vectorCtrl.embRecall({
          teamId,
          datasetIds: [datasetId],
          vector: UNIT_QUERY_VECTOR,
          limit: 10,
          hnswEfSearch: 200,
          forbidCollectionIdList: [TEST_COLLECTION_IDS[0]]
        });
        expect(forbidden.results.length).toBeGreaterThan(0);
        expect(
          forbidden.results.every((item) => item.collectionId !== TEST_COLLECTION_IDS[0])
        ).toBe(true);

        const filtered = await vectorCtrl.embRecall({
          teamId,
          datasetIds: [datasetId],
          vector: UNIT_QUERY_VECTOR,
          limit: 10,
          hnswEfSearch: 200,
          forbidCollectionIdList: [],
          filterCollectionIdList: [TEST_COLLECTION_IDS[1]]
        });
        expect(filtered.results.length).toBeGreaterThan(0);
        expect(filtered.results.every((item) => item.collectionId === TEST_COLLECTION_IDS[1])).toBe(
          true
        );

        const byTime = await vectorCtrl.getVectorDataByTime(start, new Date(Date.now() + 60_000));
        const matchedIds = byTime
          .filter((item) => item.teamId === teamId && item.datasetId === datasetId)
          .map((item) => item.id);
        expect(matchedIds).toEqual(expect.arrayContaining(insertIds));

        await vectorCtrl.delete({ teamId, idList: insertIds.slice(0, 2) });
        expect(await vectorCtrl.getVectorCount({ teamId, datasetId })).toBe(1);
      } finally {
        await vectorCtrl.delete({ teamId, datasetIds: [datasetId] }).catch(() => undefined);
      }
    });
  });
});
