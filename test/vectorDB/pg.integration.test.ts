/**
 * PgVectorCtrl integration tests. Run only when PG_URL is set.
 * Uses real PostgreSQL + pgvector; no mocks.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { EmbeddingRecallItemSchema } from '@fastgpt/service/common/vectorDB/type';
import {
  TEST_TEAM_ID,
  TEST_DATASET_ID,
  TEST_COLLECTION_ID,
  TEST_VECTORS
} from './fixtures';

vi.unmock('@fastgpt/service/common/vectorDB/constants');
vi.unmock('@fastgpt/service/common/vectorDB/pg');

const runWhenPgUrlSet = !!process.env.PG_URL;

describe.skipIf(!runWhenPgUrlSet)('PgVectorCtrl 集成测试', () => {
  let PgVectorCtrl: typeof import('@fastgpt/service/common/vectorDB/pg').PgVectorCtrl;
  let ctrl: InstanceType<typeof PgVectorCtrl>;

  beforeAll(async () => {
    const mod = await import('@fastgpt/service/common/vectorDB/pg');
    PgVectorCtrl = mod.PgVectorCtrl;
    ctrl = new PgVectorCtrl();
    await ctrl.init();
  }, 30000);

  afterEach(async () => {
    if (!ctrl) return;
    try {
      await ctrl.delete({
        teamId: TEST_TEAM_ID,
        datasetIds: [TEST_DATASET_ID],
        collectionIds: [TEST_COLLECTION_ID]
      });
    } catch {
      // ignore cleanup errors
    }
  });

  it(
    'init() succeeds',
    async () => {
      await expect(ctrl.init()).resolves.not.toThrow();
    },
    30000
  );

  it(
    'insert() returns insertIds with correct count',
    async () => {
      const res = await ctrl.insert({
        teamId: TEST_TEAM_ID,
        datasetId: TEST_DATASET_ID,
        collectionId: TEST_COLLECTION_ID,
        vectors: TEST_VECTORS
      });
      expect(res.insertIds).toBeDefined();
      expect(Array.isArray(res.insertIds)).toBe(true);
      expect(res.insertIds.length).toBe(TEST_VECTORS.length);
    },
    15000
  );

  it(
    'getVectorCount() matches insert count after insert',
    async () => {
      await ctrl.insert({
        teamId: TEST_TEAM_ID,
        datasetId: TEST_DATASET_ID,
        collectionId: TEST_COLLECTION_ID,
        vectors: TEST_VECTORS
      });
      const count = await ctrl.getVectorCount({
        teamId: TEST_TEAM_ID,
        datasetId: TEST_DATASET_ID,
        collectionId: TEST_COLLECTION_ID
      });
      expect(count).toBe(TEST_VECTORS.length);
    },
    15000
  );

  it(
    'embRecall() returns results with valid shape',
    async () => {
      await ctrl.insert({
        teamId: TEST_TEAM_ID,
        datasetId: TEST_DATASET_ID,
        collectionId: TEST_COLLECTION_ID,
        vectors: TEST_VECTORS
      });
      const res = await ctrl.embRecall({
        teamId: TEST_TEAM_ID,
        datasetIds: [TEST_DATASET_ID],
        vector: TEST_VECTORS[0],
        limit: 10,
        forbidCollectionIdList: []
      });
      expect(res.results).toBeDefined();
      expect(Array.isArray(res.results)).toBe(true);
      expect(res.results.length).toBeGreaterThanOrEqual(1);
      for (const item of res.results) {
        expect(EmbeddingRecallItemSchema.safeParse(item).success).toBe(true);
        expect(typeof item.id).toBe('string');
        expect(typeof item.collectionId).toBe('string');
        expect(typeof item.score).toBe('number');
      }
    },
    15000
  );

  it(
    'getVectorDataByTime() returns array of correct shape',
    async () => {
      const start = new Date(Date.now() - 60_000);
      const end = new Date(Date.now() + 60_000);
      const rows = await ctrl.getVectorDataByTime(start, end);
      expect(Array.isArray(rows)).toBe(true);
      for (const row of rows) {
        expect(row).toHaveProperty('id');
        expect(row).toHaveProperty('teamId');
        expect(row).toHaveProperty('datasetId');
      }
    },
    15000
  );

  it(
    'delete() by datasetIds and collectionIds then getVectorCount is 0',
    async () => {
      await ctrl.insert({
        teamId: TEST_TEAM_ID,
        datasetId: TEST_DATASET_ID,
        collectionId: TEST_COLLECTION_ID,
        vectors: TEST_VECTORS
      });
      await ctrl.delete({
        teamId: TEST_TEAM_ID,
        datasetIds: [TEST_DATASET_ID],
        collectionIds: [TEST_COLLECTION_ID]
      });
      const count = await ctrl.getVectorCount({
        teamId: TEST_TEAM_ID,
        datasetId: TEST_DATASET_ID,
        collectionId: TEST_COLLECTION_ID
      });
      expect(count).toBe(0);
    },
    15000
  );
});
