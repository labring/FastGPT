import { beforeAll, describe, expect, test } from 'vitest';
import type { VectorControllerType } from '@fastgpt/service/common/vectorDB/type';
import { createTestIds, QUERY_VECTOR, TEST_COLLECTION_IDS, TEST_VECTORS } from './testData';

const insertTestVectors = async (
  vectorCtrl: VectorControllerType,
  teamId: string,
  datasetId: string
) => {
  const insertIds: string[] = [];

  await Promise.all(
    TEST_VECTORS.map(async (vector, index) => {
      const { insertIds: ids } = await vectorCtrl.insert({
        teamId,
        datasetId,
        collectionId: TEST_COLLECTION_IDS[index],
        vectors: [vector]
      });
      insertIds.push(ids[0]);
    })
  );

  await new Promise((resolve) => setTimeout(resolve, 500));

  return insertIds;
};

const cleanupTestVectors = async (
  vectorCtrl: VectorControllerType,
  teamId: string,
  datasetId: string
) => {
  try {
    await vectorCtrl.delete({
      teamId,
      datasetIds: [datasetId]
    });
  } catch (error) {
    // Ignore cleanup errors
  }
};

export const createVectorDBTestSuite = (vectorCtrl: VectorControllerType) => {
  describe.sequential('vectorDB integration', () => {
    beforeAll(async () => {
      await vectorCtrl.init();
    });

    test('insert and count', async () => {
      const { teamId, datasetId } = createTestIds();
      const insertIds = await insertTestVectors(vectorCtrl, teamId, datasetId);

      expect(insertIds).toHaveLength(TEST_VECTORS.length);

      const count = await vectorCtrl.getVectorCount({ teamId, datasetId });
      expect(count).toBe(TEST_VECTORS.length);

      const collectionCount = await vectorCtrl.getVectorCount({
        teamId,
        datasetId,
        collectionId: TEST_COLLECTION_IDS[0]
      });
      expect(collectionCount).toBe(1);

      await cleanupTestVectors(vectorCtrl, teamId, datasetId);
    });

    test('embRecall returns results', async () => {
      const { teamId, datasetId } = createTestIds();
      await insertTestVectors(vectorCtrl, teamId, datasetId);

      const { results } = await vectorCtrl.embRecall({
        teamId,
        datasetIds: [datasetId],
        vector: QUERY_VECTOR,
        limit: 3,
        forbidCollectionIdList: []
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((item) => TEST_COLLECTION_IDS.includes(item.collectionId))).toBe(true);

      await cleanupTestVectors(vectorCtrl, teamId, datasetId);
    });

    test('embRecall respects forbidCollectionIdList', async () => {
      const { teamId, datasetId } = createTestIds();
      await insertTestVectors(vectorCtrl, teamId, datasetId);

      const { results } = await vectorCtrl.embRecall({
        teamId,
        datasetIds: [datasetId],
        vector: QUERY_VECTOR,
        limit: 10,
        forbidCollectionIdList: [TEST_COLLECTION_IDS[0]]
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((item) => item.collectionId !== TEST_COLLECTION_IDS[0])).toBe(true);

      await cleanupTestVectors(vectorCtrl, teamId, datasetId);
    });

    test('embRecall respects filterCollectionIdList', async () => {
      const { teamId, datasetId } = createTestIds();
      await insertTestVectors(vectorCtrl, teamId, datasetId);

      const { results } = await vectorCtrl.embRecall({
        teamId,
        datasetIds: [datasetId],
        vector: QUERY_VECTOR,
        limit: 10,
        forbidCollectionIdList: [],
        filterCollectionIdList: [TEST_COLLECTION_IDS[1]]
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((item) => item.collectionId === TEST_COLLECTION_IDS[1])).toBe(true);

      await cleanupTestVectors(vectorCtrl, teamId, datasetId);
    });

    test('getVectorDataByTime returns data', async () => {
      const { teamId, datasetId } = createTestIds();
      const insertIds = await insertTestVectors(vectorCtrl, teamId, datasetId);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const start = new Date(0);
      const end = new Date(Date.now() + 600_000);

      const data = await vectorCtrl.getVectorDataByTime(start, end);
      const matchedIds = data
        .filter((item) => item.teamId === teamId && item.datasetId === datasetId)
        .map((item) => item.id);

      expect(matchedIds.length).toBeGreaterThan(0);
      expect(matchedIds).toEqual(expect.arrayContaining(insertIds));

      await cleanupTestVectors(vectorCtrl, teamId, datasetId);
    });

    test('delete by idList removes vectors', async () => {
      const { teamId, datasetId } = createTestIds();
      const insertIds = await insertTestVectors(vectorCtrl, teamId, datasetId);

      await vectorCtrl.delete({
        teamId,
        idList: insertIds.slice(0, 2)
      });

      const count = await vectorCtrl.getVectorCount({ teamId, datasetId });
      expect(count).toBe(TEST_VECTORS.length - 2);

      await cleanupTestVectors(vectorCtrl, teamId, datasetId);
    });
  });
};
