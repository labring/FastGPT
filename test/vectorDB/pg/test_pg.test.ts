/**
 * PGVector integration tests for FastGPT
 *
 * Tests the PgVectorCtrl controller with actual PostgreSQL database
 * Requires: PG_URL environment variable
 *
 * Run with:
 *   PG_URL=postgresql://user:pass@host:5432/db npx vitest run test/vectorDB/pg/test_pg.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Pool } from 'pg';
import { PgVectorCtrl } from '@fastgpt/service/common/vectorDB/pg';
import { DatasetVectorTableName, PG_ADDRESS } from '@fastgpt/service/common/vectorDB/constants';
import { TEST_DATA, ENV_CONFIG } from '../utils/testData';
import {
  measureTime,
  retry,
  assert,
  assertEqual,
  assertGreaterThan,
  formatTestName,
  sleep,
} from '../utils/helper';

// Skip tests if PG_URL is not set
const describePg = PG_ADDRESS ? describe : describe.skip;

describePg('PGVector Integration Tests', () => {
  let controller: PgVectorCtrl;
  let pool: Pool;
  const testTeamId = `${TEST_DATA.teamId}-pg`;
  const testDatasetId = `${TEST_DATA.datasetId}-pg`;

  beforeAll(async () => {
    // Connect to database
    controller = new PgVectorCtrl();
    pool = new Pool({
      connectionString: PG_ADDRESS,
    });

    // Initialize the vector table
    await controller.init();

    // Wait for index to be ready
    await sleep(1000);
  });

  afterAll(async () => {
    // Cleanup test data
    try {
      await pool.query(
        `DELETE FROM ${DatasetVectorTableName} WHERE team_id = $1`,
        [testTeamId]
      );
    } catch (error) {
      console.warn('Cleanup error:', error);
    }

    // Close connection pool
    await pool.end();
  });

  beforeEach(async () => {
    // Clear test data before each test
    try {
      await pool.query(
        `DELETE FROM ${DatasetVectorTableName} WHERE team_id = $1`,
        [testTeamId]
      );
    } catch (error) {
      console.warn('Clear test data error:', error);
    }
  });

  describe('Initialization', () => {
    it('should create vector extension and table', async () => {
      const { data, duration } = await measureTime(async () => {
        const result = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM pg_extension WHERE extname = 'vector'
          ) as has_vector;
        `);

        const hasVector = result.rows[0]?.has_vector;
        assert(hasVector, 'Vector extension should be installed');

        // Check table exists
        const tableResult = await pool.query(`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = $1
          ) as has_table;
        `, [DatasetVectorTableName]);

        assert(tableResult.rows[0]?.has_table, 'Table should exist');

        return { hasVector, hasTable: tableResult.rows[0]?.has_table };
      });

      console.log(`${formatTestName('PGVector', 'Init Check')} - ${duration}ms`);
      expect(data.hasVector).toBe(true);
      expect(data.hasTable).toBe(true);
    });
  });

  describe('Insert Vectors', () => {
    it('should insert vectors successfully', async () => {
      const { data, duration } = await measureTime(async () => {
        const result = await controller.insert({
          teamId: testTeamId,
          datasetId: testDatasetId,
          collectionId: TEST_DATA.collectionId,
          vectors: TEST_DATA.vectors.slice(0, 2),
        });

        assertGreaterThan(result.insertIds.length, 0, 'Should return insert IDs');
        assertEqual(result.insertIds.length, 2, 'Should insert 2 vectors');

        return result;
      });

      console.log(`${formatTestName('PGVector', 'Insert')} - ${duration}ms`);
      expect(data.insertIds.length).toBe(2);
    });

    it('should insert single vector', async () => {
      const result = await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: [TEST_DATA.vectors[0]],
      });

      expect(result.insertIds.length).toBe(1);
    });

    it('should insert multiple vectors in batch', async () => {
      const result = await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: TEST_DATA.vectors,
      });

      expect(result.insertIds.length).toBe(5);
    });
  });

  describe('Delete Vectors', () => {
    it('should delete by id', async () => {
      // Insert first
      const insertResult = await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: [TEST_DATA.vectors[0]],
      });

      const vectorId = insertResult.insertIds[0];

      // Delete
      await controller.delete({
        teamId: testTeamId,
        id: vectorId,
      });

      // Verify deleted
      const countResult = await controller.getVectorCount({
        teamId: testTeamId,
      });

      expect(countResult).toBe(0);
    });

    it('should delete by datasetIds', async () => {
      // Insert data
      await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: TEST_DATA.vectors,
      });

      // Delete by dataset
      await controller.delete({
        teamId: testTeamId,
        datasetIds: [testDatasetId],
      });

      // Verify
      const countResult = await controller.getVectorCount({
        teamId: testTeamId,
      });

      expect(countResult).toBe(0);
    });

    it('should delete by idList', async () => {
      // Insert data
      const insertResult = await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: TEST_DATA.vectors.slice(0, 3),
      });

      // Delete by list
      await controller.delete({
        teamId: testTeamId,
        idList: insertResult.insertIds,
      });

      // Verify
      const countResult = await controller.getVectorCount({
        teamId: testTeamId,
      });

      expect(countResult).toBe(0);
    });
  });

  describe('Embedding Recall (Search)', () => {
    beforeEach(async () => {
      // Insert test data
      await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: TEST_DATA.vectors,
      });

      // Wait for index to be ready
      await sleep(500);
    });

    it('should recall similar vectors', async () => {
      const { data, duration } = await measureTime(async () => {
        const result = await controller.embRecall({
          teamId: testTeamId,
          datasetIds: [testDatasetId],
          vector: TEST_DATA.searchVector,
          limit: 3,
          forbidCollectionIdList: [],
        });

        assertGreaterThan(result.results.length, 0, 'Should return results');
        assertLessOrEqual(result.results.length, 3, 'Should respect limit');

        // Verify result structure
        result.results.forEach((item) => {
          assert(typeof item.id === 'string', 'ID should be string');
          assert(typeof item.collectionId === 'string', 'collectionId should be string');
          assert(typeof item.score === 'number', 'score should be number');
        });

        return result;
      });

      console.log(`${formatTestName('PGVector', 'Recall')} - ${duration}ms`);
      expect(data.results.length).toBeGreaterThan(0);
    });

    it('should filter by collectionId', async () => {
      // Insert into two collections
      await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId2,
        vectors: [TEST_DATA.vectors[0]],
      });

      // Search with filter
      const result = await controller.embRecall({
        teamId: testTeamId,
        datasetIds: [testDatasetId],
        vector: TEST_DATA.searchVector,
        limit: 10,
        forbidCollectionIdList: [],
        filterCollectionIdList: [TEST_DATA.collectionId2],
      });

      // All results should be from collectionId2
      result.results.forEach((item) => {
        expect(item.collectionId).toBe(TEST_DATA.collectionId2);
      });
    });

    it('should exclude forbidden collections', async () => {
      // Insert into two collections
      await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: [TEST_DATA.vectors[0]],
      });

      await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: 'forbidden-collection',
        vectors: [TEST_DATA.vectors[1]],
      });

      // Search with forbid
      const result = await controller.embRecall({
        teamId: testTeamId,
        datasetIds: [testDatasetId],
        vector: TEST_DATA.searchVector,
        limit: 10,
        forbidCollectionIdList: ['forbidden-collection'],
      });

      // No results should be from forbidden collection
      result.results.forEach((item) => {
        expect(item.collectionId).not.toBe('forbidden-collection');
      });
    });

    it('should return empty results for non-existent dataset', async () => {
      const result = await controller.embRecall({
        teamId: testTeamId,
        datasetIds: ['non-existent-dataset'],
        vector: TEST_DATA.searchVector,
        limit: 10,
        forbidCollectionIdList: [],
      });

      expect(result.results.length).toBe(0);
    });
  });

  describe('Get Vector Count', () => {
    it('should count all vectors for team', async () => {
      // Insert data
      await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: TEST_DATA.vectors,
      });

      const count = await controller.getVectorCount({
        teamId: testTeamId,
      });

      expect(count).toBe(5);
    });

    it('should count by dataset', async () => {
      const otherDatasetId = `${testDatasetId}-other`;

      // Insert into two datasets
      await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: TEST_DATA.vectors.slice(0, 2),
      });

      await controller.insert({
        teamId: testTeamId,
        datasetId: otherDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: TEST_DATA.vectors.slice(2, 4),
      });

      // Count by dataset
      const count1 = await controller.getVectorCount({
        teamId: testTeamId,
        datasetId: testDatasetId,
      });

      const count2 = await controller.getVectorCount({
        teamId: testTeamId,
        datasetId: otherDatasetId,
      });

      expect(count1).toBe(2);
      expect(count2).toBe(2);
    });

    it('should count by collection', async () => {
      // Insert into two collections
      await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: TEST_DATA.vectors.slice(0, 2),
      });

      await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId2,
        vectors: TEST_DATA.vectors.slice(2, 4),
      });

      // Count by collection
      const count1 = await controller.getVectorCount({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
      });

      const count2 = await controller.getVectorCount({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId2,
      });

      expect(count1).toBe(2);
      expect(count2).toBe(2);
    });
  });

  describe('Get Vector Data By Time', () => {
    it('should get vectors within time range', async () => {
      // Insert test data
      const insertResult = await controller.insert({
        teamId: testTeamId,
        datasetId: testDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: [TEST_DATA.vectors[0]],
      });

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

      const result = await controller.getVectorDataByTime(oneHourAgo, oneHourLater);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0].teamId).toBe(testTeamId);
      expect(result[0].datasetId).toBe(testDatasetId);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should handle complete workflow', async () => {
      const workflowDatasetId = `${testDatasetId}-workflow`;

      // 1. Insert vectors
      const insertResult = await controller.insert({
        teamId: testTeamId,
        datasetId: workflowDatasetId,
        collectionId: TEST_DATA.collectionId,
        vectors: TEST_DATA.vectors.slice(0, 3),
      });
      expect(insertResult.insertIds.length).toBe(3);

      // 2. Search vectors
      const searchResult = await controller.embRecall({
        teamId: testTeamId,
        datasetIds: [workflowDatasetId],
        vector: TEST_DATA.searchVector,
        limit: 2,
        forbidCollectionIdList: [],
      });
      expect(searchResult.results.length).toBeLessThanOrEqual(2);

      // 3. Get count
      const count = await controller.getVectorCount({
        teamId: testTeamId,
        datasetId: workflowDatasetId,
      });
      expect(count).toBe(3);

      // 4. Delete by dataset
      await controller.delete({
        teamId: testTeamId,
        datasetIds: [workflowDatasetId],
      });

      // 5. Verify deleted
      const finalCount = await controller.getVectorCount({
        teamId: testTeamId,
        datasetId: workflowDatasetId,
      });
      expect(finalCount).toBe(0);
    });
  });
});

// Helper function
function assertLessOrEqual(actual: number, max: number, message?: string): void {
  if (actual > max) {
    throw new Error(
      `Assertion failed: ${message || `Expected ${actual} <= ${max}`}`
    );
  }
}
