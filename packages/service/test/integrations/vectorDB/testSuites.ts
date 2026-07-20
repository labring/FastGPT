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

// ==================== Full-Text Search Test Suite ====================

const FULLTEXT_TEXTS = [
  'The quick brown fox jumps over the lazy dog',
  'Machine learning is transforming artificial intelligence applications',
  'FastGPT is an open source knowledge base question answering system'
];

const insertTextVectors = async (
  vectorCtrl: VectorControllerType,
  teamId: string,
  datasetId: string,
  collectionIds: string[] = [TEST_COLLECTION_IDS[0]]
) => {
  // Group vectors by collectionId, assigning texts accordingly
  const insertIds: string[] = [];
  await Promise.all(
    FULLTEXT_TEXTS.map(async (text, index) => {
      const collectionId = collectionIds[index] ?? collectionIds[0];
      const { insertIds: ids } = await vectorCtrl.insert({
        teamId,
        datasetId,
        collectionId,
        vectors: [TEST_VECTORS[index]],
        textContents: [text]
      });
      insertIds.push(ids[0]);
    })
  );

  // Wait for BM25 function to compute sparse vectors
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return insertIds;
};

const cleanupTextVectors = async (
  vectorCtrl: VectorControllerType,
  teamId: string,
  datasetId: string
) => {
  try {
    await vectorCtrl.delete({ teamId, datasetIds: [datasetId] });
  } catch {
    // ignore cleanup errors
  }
};

export const createFullTextSearchTestSuite = (vectorCtrl: VectorControllerType) => {
  describe.sequential('fullTextSearch integration', () => {
    beforeAll(async () => {
      await vectorCtrl.init();
    });

    test('returns results for matching query', async () => {
      const { teamId, datasetId } = createTestIds();
      const insertIds = await insertTextVectors(vectorCtrl, teamId, datasetId);
      expect(insertIds).toHaveLength(FULLTEXT_TEXTS.length);

      const { results } = await vectorCtrl.fullTextSearch!({
        teamId,
        datasetIds: [datasetId],
        query: 'fox',
        limit: 5,
        forbidCollectionIdList: []
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results.every((item) => !!item.id && !!item.collectionId)).toBe(true);
      // Results should have scores
      expect(results.every((item) => typeof item.score === 'number')).toBe(true);

      await cleanupTextVectors(vectorCtrl, teamId, datasetId);
    });

    test('returns empty for non-matching query', async () => {
      const { teamId, datasetId } = createTestIds();
      await insertTextVectors(vectorCtrl, teamId, datasetId);

      const { results } = await vectorCtrl.fullTextSearch!({
        teamId,
        datasetIds: [datasetId],
        query: 'zzzxyznonexistent987654321',
        limit: 5,
        forbidCollectionIdList: []
      });

      expect(results).toHaveLength(0);

      await cleanupTextVectors(vectorCtrl, teamId, datasetId);
    });

    test('respects forbidCollectionIdList', async () => {
      const { teamId, datasetId } = createTestIds();
      // All vectors in col_0
      await insertTextVectors(vectorCtrl, teamId, datasetId, [TEST_COLLECTION_IDS[0]]);

      const { results } = await vectorCtrl.fullTextSearch!({
        teamId,
        datasetIds: [datasetId],
        query: 'fox',
        limit: 5,
        forbidCollectionIdList: [TEST_COLLECTION_IDS[0]]
      });

      // All vectors are in col_0 — forbidding it should yield empty
      expect(results.every((item) => item.collectionId !== TEST_COLLECTION_IDS[0])).toBe(true);

      await cleanupTextVectors(vectorCtrl, teamId, datasetId);
    });

    test('respects filterCollectionIdList', async () => {
      const { teamId, datasetId } = createTestIds();
      // Spread vectors across col_0 and col_1
      // fox→col_0 (searched term), ml→col_1, knowledge→col_2
      const collIds = [TEST_COLLECTION_IDS[0], TEST_COLLECTION_IDS[1], TEST_COLLECTION_IDS[2]];
      await insertTextVectors(vectorCtrl, teamId, datasetId, collIds);

      const { results } = await vectorCtrl.fullTextSearch!({
        teamId,
        datasetIds: [datasetId],
        query: 'fox',
        limit: 5,
        forbidCollectionIdList: [],
        filterCollectionIdList: [TEST_COLLECTION_IDS[0]]
      });

      // Only col_0 returned
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((item) => item.collectionId === TEST_COLLECTION_IDS[0])).toBe(true);

      await cleanupTextVectors(vectorCtrl, teamId, datasetId);
    });

    test('empty query returns empty', async () => {
      const { results } = await vectorCtrl.fullTextSearch!({
        teamId: 'test_team',
        datasetIds: ['test_dataset'],
        query: '',
        limit: 5,
        forbidCollectionIdList: []
      });

      expect(results).toHaveLength(0);
    });

    test('empty datasetIds returns empty', async () => {
      const { results } = await vectorCtrl.fullTextSearch!({
        teamId: 'test_team',
        datasetIds: [],
        query: 'search term',
        limit: 5,
        forbidCollectionIdList: []
      });

      expect(results).toHaveLength(0);
    });

    test('limit=0 returns empty', async () => {
      const { results } = await vectorCtrl.fullTextSearch!({
        teamId: 'test_team',
        datasetIds: ['test_dataset'],
        query: 'search term',
        limit: 0,
        forbidCollectionIdList: []
      });

      expect(results).toHaveLength(0);
    });
  });
};
