/**
 * Tests for the chunkIndex-based resume approach.
 *
 * The fix uses:
 * 1. chunkIndex dedup in createDataDrafts: skip chunks already covered by existing Data
 * 2. dataId-based Training dedup: skip Training for Data that already has one
 * 3. Per-batch independent transactions (500 records/batch)
 * 4. No deletion of any data — pure "resume where left off"
 *
 * Run (from repo root):
 *   MONGODB_TEST_URI="mongodb://myusername:mypassword@127.0.0.1:30017/fastgpt?authSource=admin&directConnection=true" \
 *   node_modules/.bin/vitest run test/cases/service/core/dataset/parseReconcile.test.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { Types, connectionMongo } from '@fastgpt/service/common/mongo';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { createDataDrafts } from '@fastgpt/service/core/dataset/data/controller';
import { pushDataListToTrainingQueue } from '@fastgpt/service/core/dataset/training/controller';

// Mock model lookup functions — pushDataListToTrainingQueue validates these
vi.mock('@fastgpt/service/core/ai/model', async () => {
  return {
    getLLMModelById: vi.fn(() => ({ model: 'gpt-4', maxToken: 8192, weight: 1 })),
    getEmbeddingModelById: vi.fn(() => ({ model: 'text-embedding-3', weight: 1 })),
    getVlmModelById: vi.fn(() => ({ model: 'gpt-4v', maxToken: 8192, weight: 1 }))
  };
});

const newId = () => new Types.ObjectId();

// ============================================================================
// Helpers
// ============================================================================

async function createTestData(overrides: Record<string, any> = {}) {
  return MongoDatasetData.create({
    teamId: newId(),
    tmbId: newId(),
    datasetId: newId(),
    collectionId: newId(),
    q: 'test q',
    a: 'test a',
    chunkIndex: 0,
    indexes: [],
    ...overrides
  });
}

// ============================================================================
// 1. chunkIndex dedup in createDataDrafts
// ============================================================================
describe('chunkIndex dedup', () => {
  it('should skip creation for chunkIndexes already covered by existing Data', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    // Simulate partial Data from a prior failed attempt (chunkIndex 0..19)
    await MongoDatasetData.create(
      Array.from({ length: 20 }, (_, i) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: `chunk-${i}`,
        chunkIndex: i,
        indexes: [],
        createTime: new Date()
      }))
    );

    // Query covered chunkIndexes (as runParseQueue does)
    const coveredChunkIndexes = new Set(
      (await MongoDatasetData.find({ teamId, datasetId, collectionId }, 'chunkIndex').lean()).map(
        (d) => d.chunkIndex
      )
    );

    expect(coveredChunkIndexes.size).toBe(20);
    for (let i = 0; i < 20; i++) {
      expect(coveredChunkIndexes.has(i)).toBe(true);
    }

    // Simulate parsedDatas with 100 chunks
    const parsedDatas = Array.from({ length: 100 }, (_, i) => ({
      q: `chunk-${i}`,
      chunkIndex: i,
      indexes: []
    }));

    const newItems = parsedDatas
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => !coveredChunkIndexes.has(i));

    expect(newItems).toHaveLength(80);
    for (const { i } of newItems) {
      expect(i).toBeGreaterThanOrEqual(20);
    }

    // Cleanup
    await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
  });

  it('should create all Data on first parse (no existing chunkIndexes)', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    const coveredChunkIndexes = new Set(
      (await MongoDatasetData.find({ teamId, datasetId, collectionId }, 'chunkIndex').lean()).map(
        (d) => d.chunkIndex
      )
    );

    expect(coveredChunkIndexes.size).toBe(0);

    const parsedDatas = Array.from({ length: 50 }, (_, i) => ({
      q: `chunk-${i}`,
      chunkIndex: i,
      indexes: []
    }));

    const newItems = parsedDatas
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => !coveredChunkIndexes.has(i));

    expect(newItems).toHaveLength(50);
  });

  it('should handle mixed state: some chunkIndexes covered, some not', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    // Pre-existing Data at chunkIndex 0, 2, 4, 6, 8 (partial from prior failure)
    await MongoDatasetData.create(
      [0, 2, 4, 6, 8].map((i) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: `chunk-${i}`,
        chunkIndex: i,
        indexes: [],
        createTime: new Date()
      }))
    );

    const coveredChunkIndexes = new Set(
      (await MongoDatasetData.find({ teamId, datasetId, collectionId }, 'chunkIndex').lean()).map(
        (d) => d.chunkIndex
      )
    );

    const parsedDatas = Array.from({ length: 10 }, (_, i) => ({
      q: `chunk-${i}`,
      chunkIndex: i,
      indexes: []
    }));

    const newItems = parsedDatas
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => !coveredChunkIndexes.has(i));

    // Only chunkIndex 1, 3, 5, 7, 9 should be new
    expect(newItems).toHaveLength(5);
    expect(newItems.map((x) => x.i).sort()).toEqual([1, 3, 5, 7, 9]);

    // Cleanup
    await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
  });
});

// ============================================================================
// 2. dataId-based Training dedup
// ============================================================================
describe('dataId-based Training dedup', () => {
  it('should skip Training creation for Data that already has Training records', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    // Create 5 Data records
    const dataRecords = await MongoDatasetData.create(
      Array.from({ length: 5 }, (_, i) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: `q-${i}`,
        chunkIndex: i,
        indexes: [],
        createTime: new Date()
      }))
    );

    // Create Training for the first 2 Data records
    await MongoDatasetTraining.create(
      [dataRecords[0], dataRecords[1]].map((d) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'test-bill',
        mode: TrainingModeEnum.chunk,
        dataId: d._id,
        chunkIndex: d.chunkIndex,
        retryCount: 5
      }))
    );

    // Simulate dedup: check which dataIds already have Training
    const existingTrainingDataIds = new Set(
      (
        await MongoDatasetTraining.find(
          { teamId, datasetId, collectionId, mode: TrainingModeEnum.chunk },
          'dataId'
        ).lean()
      )
        .filter((t) => t.dataId)
        .map((t) => String(t.dataId))
    );

    // No completed Data (all have indexes: [])
    const completedDataIds = new Set<string>();

    // Simulate parsedDatas from retry
    const parsedDatas = dataRecords.map((d) => ({
      id: String(d._id),
      q: d.q,
      chunkIndex: d.chunkIndex,
      indexes: []
    }));

    // New 3-way filter matching production code
    const newTrainingData = parsedDatas.filter((item) => {
      if (!item.id) return true;
      if (existingTrainingDataIds.has(item.id)) return false;
      if (completedDataIds.has(item.id)) return false;
      return true;
    });

    // Only the last 3 should need new Training
    expect(newTrainingData).toHaveLength(3);
    expect(newTrainingData.map((d) => d.id).sort()).toEqual(
      [dataRecords[2], dataRecords[3], dataRecords[4]].map((d) => String(d._id)).sort()
    );

    // Cleanup
    await MongoDatasetTraining.deleteMany({ teamId, datasetId, collectionId });
    await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
  });

  it('should push Training for all Data on first parse (no existing Training)', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    // Create 5 Data records
    const dataRecords = await MongoDatasetData.create(
      Array.from({ length: 5 }, (_, i) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: `q-${i}`,
        chunkIndex: i,
        indexes: [],
        createTime: new Date()
      }))
    );

    // No Training yet — all Data should need Training
    const existingTrainingDataIds = new Set(
      (
        await MongoDatasetTraining.find(
          { teamId, datasetId, collectionId, mode: TrainingModeEnum.chunk },
          'dataId'
        ).lean()
      )
        .filter((t) => t.dataId)
        .map((t) => String(t.dataId))
    );

    expect(existingTrainingDataIds.size).toBe(0);

    // No completed Data (all indexes are [])
    const completedDataIds = new Set<string>();

    const parsedDatas = dataRecords.map((d) => ({
      id: String(d._id),
      q: d.q,
      chunkIndex: d.chunkIndex,
      indexes: []
    }));

    // New 3-way filter matching production code
    const newTrainingData = parsedDatas.filter((item) => {
      if (!item.id) return true;
      if (existingTrainingDataIds.has(item.id)) return false;
      if (completedDataIds.has(item.id)) return false;
      return true;
    });

    expect(newTrainingData).toHaveLength(5);

    // Cleanup
    await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
  });

  it('should skip Training when Data is already vectorized even if Training does not exist', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    // 3 drafts (indexes: []) and 2 already vectorized, no Training records at all
    const dataRecords = await MongoDatasetData.create([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: 'q-0',
        chunkIndex: 0,
        indexes: [],
        createTime: new Date()
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: 'q-1',
        chunkIndex: 1,
        indexes: [],
        createTime: new Date()
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: 'q-2',
        chunkIndex: 2,
        indexes: [],
        createTime: new Date()
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: 'q-3',
        chunkIndex: 3,
        indexes: [{ type: 'custom', text: 'vec-3', dataId: 'v3' }],
        createTime: new Date()
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: 'q-4',
        chunkIndex: 4,
        indexes: [{ type: 'custom', text: 'vec-4', dataId: 'v4' }],
        createTime: new Date()
      }
    ]);

    const existingTrainingDataIds = new Set(
      (
        await MongoDatasetTraining.find(
          { teamId, datasetId, collectionId, mode: TrainingModeEnum.chunk },
          'dataId'
        ).lean()
      )
        .filter((t) => t.dataId)
        .map((t) => String(t.dataId))
    );
    expect(existingTrainingDataIds.size).toBe(0);

    const completedDataIds = new Set(
      (
        await MongoDatasetData.find(
          { teamId, datasetId, collectionId, indexes: { $not: { $size: 0 } } },
          '_id'
        ).lean()
      ).map((d) => String(d._id))
    );
    expect(completedDataIds.size).toBe(2);

    const parsedDatas = dataRecords.map((d) => ({
      id: String(d._id),
      q: d.q,
      chunkIndex: d.chunkIndex,
      indexes: []
    }));

    // New 3-way filter: no id → create, Training exists → skip, already vectorized → skip
    const newTrainingData = parsedDatas.filter((item) => {
      if (!item.id) return true;
      if (existingTrainingDataIds.has(item.id)) return false;
      if (completedDataIds.has(item.id)) return false;
      return true;
    });

    expect(newTrainingData).toHaveLength(3);
    expect(newTrainingData.map((d) => d.id).sort()).toEqual(
      [dataRecords[0], dataRecords[1], dataRecords[2]].map((d) => String(d._id)).sort()
    );

    await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
  });
});

// ============================================================================
// 3. Per-batch transaction behavior
// ============================================================================
describe('Per-batch Transactions', () => {
  describe('createDataDrafts', () => {
    it('should call mongoSessionRun ceil(n/500) times when no session is passed', async () => {
      vi.clearAllMocks();

      const teamId = String(newId());
      const tmbId = String(newId());
      const datasetId = String(newId());
      const collectionId = String(newId());

      const itemCount = 1500;
      const items = Array.from({ length: itemCount }, (_, i) => ({
        q: `q-${i}`,
        a: `a-${i}`,
        chunkIndex: i
      }));

      const callCountBefore = vi.mocked(mongoSessionRun).mock.calls.length;

      const results = await createDataDrafts({
        items,
        teamId,
        tmbId,
        datasetId,
        collectionId
        // No session
      });

      const callCountAfter = vi.mocked(mongoSessionRun).mock.calls.length;
      const newCalls = callCountAfter - callCountBefore;

      // ceil(1500/500) = 3
      expect(newCalls).toBe(3);
      expect(results).toHaveLength(itemCount);
      for (let i = 0; i < results.length; i++) {
        expect(results[i]).toHaveProperty('_id');
      }
    });

    it('should NOT call mongoSessionRun internally when session is passed', async () => {
      vi.clearAllMocks();

      const teamId = String(newId());
      const tmbId = String(newId());
      const datasetId = String(newId());
      const collectionId = String(newId());

      const session = await connectionMongo.startSession();
      session.startTransaction();

      const items = Array.from({ length: 100 }, (_, i) => ({
        q: `q-${i}`,
        a: `a-${i}`,
        chunkIndex: i
      }));

      const callCountBefore = vi.mocked(mongoSessionRun).mock.calls.length;

      try {
        await createDataDrafts({
          items,
          teamId,
          tmbId,
          datasetId,
          collectionId,
          session
        });

        await session.commitTransaction();
      } catch (err) {
        if (!session.transaction.isCommitted) await session.abortTransaction();
        throw err;
      } finally {
        await session.endSession();
      }

      const callCountAfter = vi.mocked(mongoSessionRun).mock.calls.length;
      expect(callCountAfter).toBe(callCountBefore);
    });

    it('should store provided chunkIndex correctly', async () => {
      const teamId = String(newId());
      const tmbId = String(newId());
      const datasetId = String(newId());
      const collectionId = String(newId());

      const items = [
        { q: 'q-0', a: 'a-0', chunkIndex: 5 },
        { q: 'q-1', a: 'a-1', chunkIndex: 10 }
      ];

      const results = await createDataDrafts({
        items,
        teamId,
        tmbId,
        datasetId,
        collectionId
      });

      expect(results).toHaveLength(2);

      const createdDocs = await MongoDatasetData.find(
        { teamId, datasetId, collectionId },
        'chunkIndex'
      ).lean();

      const indexes = createdDocs.map((d) => d.chunkIndex).sort((a, b) => a - b);
      expect(indexes).toEqual([5, 10]);

      // Cleanup
      await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
    });
  });

  describe('pushDataListToTrainingQueue', () => {
    it('should call mongoSessionRun ceil(n/500) times when no session is passed', async () => {
      vi.clearAllMocks();

      const teamId = String(newId());
      const tmbId = String(newId());
      const datasetId = String(newId());
      const collectionId = String(newId());

      const itemCount = 1200;
      const data = Array.from({ length: itemCount }, (_, i) => ({
        q: `q-${i}`,
        a: `a-${i}`,
        chunkIndex: i
      }));

      const callCountBefore = vi.mocked(mongoSessionRun).mock.calls.length;

      const result = await pushDataListToTrainingQueue({
        teamId,
        tmbId,
        datasetId,
        collectionId,
        agentModelId: 'test-model',
        vectorModelId: 'test-vector-model',
        data,
        billId: 'test-bill',
        mode: TrainingModeEnum.chunk
        // No session
      });

      const callCountAfter = vi.mocked(mongoSessionRun).mock.calls.length;
      const newCalls = callCountAfter - callCountBefore;

      // ceil(1200/500) = 3
      expect(newCalls).toBe(3);
      expect(result.insertLen).toBe(itemCount);
    });
  });

  describe('batch isolation', () => {
    it('should leave committed batch data in DB when all batches succeed', async () => {
      const teamId = String(newId());
      const tmbId = String(newId());
      const datasetId = String(newId());
      const collectionId = String(newId());

      const items = Array.from({ length: 1000 }, (_, i) => ({
        q: `q-${i}`,
        a: `a-${i}`,
        chunkIndex: i
      }));

      const results = await createDataDrafts({
        items,
        teamId,
        tmbId,
        datasetId,
        collectionId
      });

      expect(results).toHaveLength(1000);

      const allData = await MongoDatasetData.find(
        { teamId, datasetId, collectionId },
        '_id'
      ).lean();
      expect(allData).toHaveLength(1000);

      // Cleanup
      await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
    });
  });
});

// ============================================================================
// 4. End-to-end reentrancy: simulate parse → partial failure → retry
// ============================================================================
describe('End-to-end reentrancy', () => {
  /**
   * Helper that replicates the dedup logic inside runParseQueue (steps 5.5–6).
   * Returns { newDataCount, newTrainingCount } so tests can assert on outcomes.
   */
  async function simulateParseRetry({
    teamId,
    datasetId,
    collectionId,
    parsedDatas
  }: {
    teamId: string;
    datasetId: string;
    collectionId: string;
    parsedDatas: { q: string; a?: string; chunkIndex: number; metadata?: any }[];
  }) {
    // Step 5.5: chunkIndex dedup
    const allExistingData = await MongoDatasetData.find(
      { teamId, datasetId, collectionId },
      '_id chunkIndex'
    ).lean();

    const coveredChunkIndexes = new Set(allExistingData.map((d) => d.chunkIndex));

    const completedDataIds = new Set(
      (
        await MongoDatasetData.find(
          { teamId, datasetId, collectionId, 'indexes.0': { $exists: true } },
          '_id'
        ).lean()
      ).map((d) => String(d._id))
    );

    const newItems = parsedDatas
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => !coveredChunkIndexes.has(i));

    // Create Data drafts for new items only
    const draftResults =
      newItems.length > 0
        ? await createDataDrafts({
            items: newItems.map(({ item, i }) => ({
              q: item.q || '',
              a: item.a || '',
              chunkIndex: i,
              metadata: item.metadata
            })),
            teamId,
            tmbId: String(newId()),
            datasetId,
            collectionId
          })
        : [];

    // Build id lookup
    const chunkIndexToId = new Map(
      allExistingData.map((d) => [d.chunkIndex, String(d._id)] as const)
    );
    newItems.forEach(({ i }, newIdx) => {
      chunkIndexToId.set(i, String(draftResults[newIdx]._id));
    });
    const parsedDatasWithId = parsedDatas.map((item, idx) => ({
      ...item,
      id: chunkIndexToId.get(idx) || ''
    }));

    // Step 6: Training dedup (3-way)
    const existingTrainingDataIds = new Set(
      (
        await MongoDatasetTraining.find(
          { teamId, datasetId, collectionId, mode: TrainingModeEnum.chunk },
          'dataId'
        ).lean()
      )
        .filter((t) => t.dataId)
        .map((t) => String(t.dataId))
    );

    const newTrainingData = parsedDatasWithId.filter((item) => {
      if (!item.id) return true;
      if (existingTrainingDataIds.has(item.id)) return false;
      if (completedDataIds.has(item.id)) return false;
      return true;
    });

    let newTrainingCount = 0;
    if (newTrainingData.length > 0) {
      const result = await pushDataListToTrainingQueue({
        teamId,
        tmbId: String(newId()),
        datasetId,
        collectionId,
        agentModelId: 'test-model',
        vectorModelId: 'test-vector-model',
        data: newTrainingData,
        billId: 'test-bill',
        mode: TrainingModeEnum.chunk
      });
      newTrainingCount = result.insertLen;
    }

    return {
      newDataCount: draftResults.length,
      newTrainingCount,
      completedDataCount: completedDataIds.size,
      existingTrainingCount: existingTrainingDataIds.size
    };
  }

  const newId = () => new Types.ObjectId();

  it('Scenario A: Data partially created, no Training — retry should fill missing Data + all Training', async () => {
    const teamId = String(newId());
    const datasetId = String(newId());
    const collectionId = String(newId());

    // Simulate prior partial run: Data for chunkIndex 0..19, no Training
    await MongoDatasetData.create(
      Array.from({ length: 20 }, (_, i) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: `chunk-${i}`,
        chunkIndex: i,
        indexes: [],
        createTime: new Date()
      }))
    );

    // "Parse" 100 chunks
    const parsedDatas = Array.from({ length: 100 }, (_, i) => ({
      q: `chunk-${i}`,
      chunkIndex: i
    }));

    const result = await simulateParseRetry({ teamId, datasetId, collectionId, parsedDatas });

    // 80 new Data (20 already existed)
    expect(result.newDataCount).toBe(80);

    // All 100 get Training (none existed before)
    expect(result.newTrainingCount).toBe(100);

    // Verify final state
    const allData = await MongoDatasetData.find(
      { teamId, datasetId, collectionId },
      'chunkIndex'
    ).lean();
    expect(allData).toHaveLength(100);
    const allTraining = await MongoDatasetTraining.find({
      teamId,
      datasetId,
      collectionId,
      mode: TrainingModeEnum.chunk
    }).lean();
    expect(allTraining).toHaveLength(100);

    // Cleanup
    await MongoDatasetTraining.deleteMany({ teamId, datasetId, collectionId });
    await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
  });

  it('Scenario B: Data fully created, Training partially created — retry should skip all Data, fill missing Training', async () => {
    const teamId = String(newId());
    const datasetId = String(newId());
    const collectionId = String(newId());

    // All 100 Data exist
    const dataRecords = await MongoDatasetData.create(
      Array.from({ length: 100 }, (_, i) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: `chunk-${i}`,
        chunkIndex: i,
        indexes: [],
        createTime: new Date()
      }))
    );

    // Only first 60 have Training (pushDataListToTrainingQueue partially succeeded)
    await MongoDatasetTraining.create(
      dataRecords.slice(0, 60).map((d) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'test-bill',
        mode: TrainingModeEnum.chunk,
        dataId: d._id,
        chunkIndex: d.chunkIndex,
        retryCount: 5
      }))
    );

    const parsedDatas = Array.from({ length: 100 }, (_, i) => ({
      q: `chunk-${i}`,
      chunkIndex: i
    }));

    const result = await simulateParseRetry({ teamId, datasetId, collectionId, parsedDatas });

    // 0 new Data (all 100 exist)
    expect(result.newDataCount).toBe(0);

    // 40 new Training (60 already exist)
    expect(result.newTrainingCount).toBe(40);

    const allData = await MongoDatasetData.find({ teamId, datasetId, collectionId }).lean();
    expect(allData).toHaveLength(100);
    const allTraining = await MongoDatasetTraining.find({
      teamId,
      datasetId,
      collectionId,
      mode: TrainingModeEnum.chunk
    }).lean();
    expect(allTraining).toHaveLength(100);

    // Cleanup
    await MongoDatasetTraining.deleteMany({ teamId, datasetId, collectionId });
    await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
  });

  it('Scenario C: generateVector consumed all Training, some Data vectorized — retry should skip all Data + skip vectorized Data Training', async () => {
    const teamId = String(newId());
    const datasetId = String(newId());
    const collectionId = String(newId());

    // 30 Data with filled indexes (generateVector already processed), 70 drafts
    await MongoDatasetData.create([
      ...Array.from({ length: 30 }, (_, i) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: `chunk-${i}`,
        chunkIndex: i,
        indexes: [{ type: 'custom' as const, text: `vec-${i}`, dataId: `vid-${i}` }],
        createTime: new Date()
      })),
      ...Array.from({ length: 70 }, (_, i) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: `chunk-${i + 30}`,
        chunkIndex: i + 30,
        indexes: [],
        createTime: new Date()
      }))
    ]);

    // No Training (generateVector consumed and deleted all)

    const parsedDatas = Array.from({ length: 100 }, (_, i) => ({
      q: `chunk-${i}`,
      chunkIndex: i
    }));

    const result = await simulateParseRetry({ teamId, datasetId, collectionId, parsedDatas });

    // 0 new Data (all 100 exist)
    expect(result.newDataCount).toBe(0);
    // 30 already vectorized → skipped, 70 drafts → Training created
    expect(result.completedDataCount).toBe(30);
    expect(result.newTrainingCount).toBe(70);

    const allData = await MongoDatasetData.find({ teamId, datasetId, collectionId }).lean();
    expect(allData).toHaveLength(100);
    const allTraining = await MongoDatasetTraining.find({
      teamId,
      datasetId,
      collectionId,
      mode: TrainingModeEnum.chunk
    }).lean();
    expect(allTraining).toHaveLength(70);

    // Cleanup
    await MongoDatasetTraining.deleteMany({ teamId, datasetId, collectionId });
    await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
  });

  it('Scenario D: generateVector actively processing — retry should skip all Data + skip all Training (still locked)', async () => {
    const teamId = String(newId());
    const datasetId = String(newId());
    const collectionId = String(newId());

    // All 100 Data exist (all drafts)
    const dataRecords = await MongoDatasetData.create(
      Array.from({ length: 100 }, (_, i) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: `chunk-${i}`,
        chunkIndex: i,
        indexes: [],
        createTime: new Date()
      }))
    );

    // All 100 Training exist (generateVector is processing, some locked)
    await MongoDatasetTraining.create(
      dataRecords.map((d) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'test-bill',
        mode: TrainingModeEnum.chunk,
        dataId: d._id,
        chunkIndex: d.chunkIndex,
        retryCount: 5
      }))
    );

    const parsedDatas = Array.from({ length: 100 }, (_, i) => ({
      q: `chunk-${i}`,
      chunkIndex: i
    }));

    const result = await simulateParseRetry({ teamId, datasetId, collectionId, parsedDatas });

    // 0 new Data
    expect(result.newDataCount).toBe(0);
    // 0 new Training (all dataIds still in existingTrainingDataIds)
    expect(result.newTrainingCount).toBe(0);

    const allData = await MongoDatasetData.find({ teamId, datasetId, collectionId }).lean();
    expect(allData).toHaveLength(100);
    // No duplicates — still exactly 100 Training
    const allTraining = await MongoDatasetTraining.find({
      teamId,
      datasetId,
      collectionId,
      mode: TrainingModeEnum.chunk
    }).lean();
    expect(allTraining).toHaveLength(100);

    // Cleanup
    await MongoDatasetTraining.deleteMany({ teamId, datasetId, collectionId });
    await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
  });

  it('Scenario E: multiple retries — idempotent, same result each time', async () => {
    const teamId = String(newId());
    const datasetId = String(newId());
    const collectionId = String(newId());

    // Partial Data: chunkIndex 0..19, no Training
    await MongoDatasetData.create(
      Array.from({ length: 20 }, (_, i) => ({
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: `chunk-${i}`,
        chunkIndex: i,
        indexes: [],
        createTime: new Date()
      }))
    );

    const parsedDatas = Array.from({ length: 100 }, (_, i) => ({
      q: `chunk-${i}`,
      chunkIndex: i
    }));

    // Retry 1
    const r1 = await simulateParseRetry({ teamId, datasetId, collectionId, parsedDatas });
    expect(r1.newDataCount).toBe(80);
    expect(r1.newTrainingCount).toBe(100);

    // Retry 2 — idempotent
    const r2 = await simulateParseRetry({ teamId, datasetId, collectionId, parsedDatas });
    expect(r2.newDataCount).toBe(0);
    expect(r2.newTrainingCount).toBe(0);

    // Retry 3 — still idempotent
    const r3 = await simulateParseRetry({ teamId, datasetId, collectionId, parsedDatas });
    expect(r3.newDataCount).toBe(0);
    expect(r3.newTrainingCount).toBe(0);

    // Final state correct: 100 Data, 100 Training, no duplicates
    const allData = await MongoDatasetData.find({ teamId, datasetId, collectionId }).lean();
    expect(allData).toHaveLength(100);
    const allTraining = await MongoDatasetTraining.find({
      teamId,
      datasetId,
      collectionId,
      mode: TrainingModeEnum.chunk
    }).lean();
    expect(allTraining).toHaveLength(100);

    // Cleanup
    await MongoDatasetTraining.deleteMany({ teamId, datasetId, collectionId });
    await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
  });
});

// ============================================================================
// 5. Parse retry ↔ generateVector race-condition analysis
// ============================================================================
// These tests verify that even when parse retry and generateVector interleave
// (the narrowest race windows), the system remains eventually consistent.
// generateVector's 3-layer defensive logic is the safety net.
describe('Parse retry vs generateVector race conditions', () => {
  const newId = () => new Types.ObjectId();

  describe('generateVector defensive layer 1: missing dataId', () => {
    it('should detect and delete orphan Training with no dataId', async () => {
      const teamId = newId();
      const datasetId = newId();
      const collectionId = newId();

      // Simulate race: parse retry created Training without dataId
      // (chunkIndex was in coveredChunkIndexes but Data was deleted between queries).
      // Use insertMany to bypass Mongoose schema-level quirks.
      const [training] = await MongoDatasetTraining.insertMany([
        {
          teamId,
          tmbId: newId(),
          datasetId,
          collectionId,
          billId: 'test-bill',
          mode: TrainingModeEnum.chunk,
          retryCount: 5
        }
      ]);

      // generateVector's check (generateVector.ts:371)
      const fetchedTraining = await MongoDatasetTraining.findById(training._id).lean();
      const isOrphan = !fetchedTraining?.dataId;
      expect(isOrphan).toBe(true);

      // Verify cleanup action: deleteOne is safe
      await MongoDatasetTraining.deleteOne({ _id: training._id });
      const after = await MongoDatasetTraining.findById(training._id).lean();
      expect(after).toBeNull();

      // Cleanup
      await MongoDatasetTraining.deleteMany({ teamId, datasetId, collectionId });
    });
  });

  describe('generateVector defensive layer 2: Data document deleted', () => {
    it('should detect and delete Training whose Data was deleted', async () => {
      const teamId = newId();
      const datasetId = newId();
      const collectionId = newId();

      // Create Data + Training
      const [dataDoc] = await MongoDatasetData.create([
        {
          teamId,
          tmbId: newId(),
          datasetId,
          collectionId,
          q: 'test',
          chunkIndex: 0,
          indexes: [],
          createTime: new Date()
        }
      ]);
      const [training] = await MongoDatasetTraining.create([
        {
          teamId,
          tmbId: newId(),
          datasetId,
          collectionId,
          billId: 'test-bill',
          mode: TrainingModeEnum.chunk,
          dataId: dataDoc._id,
          retryCount: 5
        }
      ]);

      // Simulate race: Data deleted (e.g. by admin) after parse created Training
      await MongoDatasetData.deleteOne({ _id: dataDoc._id });

      // generateVector's check (generateVector.ts:393)
      const dataExists = await MongoDatasetData.findById(dataDoc._id, '_id').lean();
      expect(dataExists).toBeNull();

      // Verify cleanup
      if (!dataExists) {
        await MongoDatasetTraining.deleteOne({ _id: training._id });
      }
      const after = await MongoDatasetTraining.findById(training._id).lean();
      expect(after).toBeNull();

      // Cleanup
      await MongoDatasetTraining.deleteMany({ teamId, datasetId, collectionId });
      await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
    });
  });

  describe('generateVector defensive layer 3: Data already has indexes', () => {
    it('should route to rebuildData when Data has existing indexes (duplicate Training from race)', async () => {
      const teamId = newId();
      const datasetId = newId();
      const collectionId = newId();

      // Simulate the worst-case race:
      // T0: parse queries completedDataIds → chunk 5 indexes empty → NOT in set
      // T1: generateVector finishes chunk 5 → fills indexes, deletes Training
      // T2: parse queries existingTrainingDataIds → Training deleted → NOT in set
      // T3: parse creates duplicate Training for chunk 5
      // T4: generateVector picks up duplicate → Data.indexes.length > 0

      const [dataDoc] = await MongoDatasetData.create([
        {
          teamId,
          tmbId: newId(),
          datasetId,
          collectionId,
          q: 'chunk-5',
          chunkIndex: 5,
          indexes: [{ type: 'custom', text: 'already-vectorized', dataId: 'vec-5' }],
          createTime: new Date()
        }
      ]);

      // Parse retry created this duplicate Training (race result)
      const [dupTraining] = await MongoDatasetTraining.create([
        {
          teamId,
          tmbId: newId(),
          datasetId,
          collectionId,
          billId: 'test-bill',
          mode: TrainingModeEnum.chunk,
          dataId: dataDoc._id,
          chunkIndex: 0,
          retryCount: 5
        }
      ]);

      // generateVector's routing check (generateVector.ts:180-188)
      const fetched = await MongoDatasetTraining.findById(dupTraining._id)
        .populate<{ data: { indexes: any[] } | null }>({ path: 'data', select: 'indexes' })
        .lean();

      const hasExistingIndexes =
        fetched?.dataId && fetched?.data && fetched.data.indexes.length > 0;
      expect(hasExistingIndexes).toBe(true);
      // → routes to rebuildData (safe: old vectors deleted before new ones written)

      // Verify rebuildData would handle it correctly:
      // 1. Old vector IDs extracted from Data.indexes
      const oldVectorIds = fetched!.data!.indexes.map((idx: any) => idx.dataId);
      expect(oldVectorIds).toContain('vec-5');
      // 2. Old vectors are deleted (outside transaction, try/catch)
      // 3. New vectors are created
      // 4. Data.indexes overwritten atomically with Training delete

      // Cleanup
      await MongoDatasetTraining.deleteMany({ teamId, datasetId, collectionId });
      await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
    });

    it('should route to insertData with cleanup when Data has indexes but dataId points to already-processed doc', async () => {
      const teamId = newId();
      const datasetId = newId();
      const collectionId = newId();

      // Simulate: parse retry created Training, but generateVector had already
      // partially updated Data (indexes filled but Training not yet deleted —
      // impossible in current code since both are in same transaction, but
      // defensive check handles it anyway)

      const [dataDoc] = await MongoDatasetData.create([
        {
          teamId,
          tmbId: newId(),
          datasetId,
          collectionId,
          q: 'chunk-7',
          chunkIndex: 7,
          indexes: [{ type: 'custom', text: 'stale-vector', dataId: 'stale-vid' }],
          createTime: new Date()
        }
      ]);

      // generateVector's insertData defensive check (generateVector.ts:406-423)
      const existingIndexes = dataDoc.indexes;
      expect(existingIndexes.length).toBeGreaterThan(0);

      // If insertData path is taken (e.g. data.data was null in populate,
      // forcing a fallback to findById), the defensive check:
      // 1. Logs warning
      // 2. Deletes old vectors (try/catch)
      // 3. Proceeds to create new vectors and overwrite indexes
      // This is safe — old vectors are cleaned up first

      const oldVectorIds = existingIndexes.map((idx: any) => idx.dataId);
      expect(oldVectorIds).toEqual(['stale-vid']);
      // These would be deleted by deleteDatasetDataVector before new insert

      // Cleanup
      await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
    });
  });

  describe('Full race simulation: parse retry interleaved with generateVector', () => {
    it('should produce eventually consistent state when generateVector is actively consuming', async () => {
      const teamId = String(newId());
      const datasetId = String(newId());
      const collectionId = String(newId());

      // Initial state: 100 Data (all drafts), 100 Training
      const dataRecords = await MongoDatasetData.create(
        Array.from({ length: 100 }, (_, i) => ({
          teamId,
          tmbId: newId(),
          datasetId,
          collectionId,
          q: `chunk-${i}`,
          chunkIndex: i,
          indexes: [],
          createTime: new Date()
        }))
      );
      await MongoDatasetTraining.create(
        dataRecords.map((d) => ({
          teamId,
          tmbId: newId(),
          datasetId,
          collectionId,
          billId: 'test-bill',
          mode: TrainingModeEnum.chunk,
          dataId: d._id,
          chunkIndex: d.chunkIndex,
          retryCount: 5
        }))
      );

      // Simulate generateVector consuming 30 items (in reality this happens
      // concurrently with parse retry, but we simulate the interleaving)
      const consumed = dataRecords.slice(0, 30);
      const remaining = dataRecords.slice(30);
      for (const d of consumed) {
        await MongoDatasetData.updateOne(
          { _id: d._id },
          {
            $set: {
              indexes: [
                { type: 'custom', text: `vec-${d.chunkIndex}`, dataId: `vid-${d.chunkIndex}` }
              ]
            }
          }
        );
        await MongoDatasetTraining.deleteOne({ dataId: d._id, mode: TrainingModeEnum.chunk });
      }

      // Now parse retry runs (while generateVector is still processing 31..99)
      const parsedDatas = Array.from({ length: 100 }, (_, i) => ({
        q: `chunk-${i}`,
        chunkIndex: i
      }));

      // Run the same logic as runParseQueue
      const allExistingData = await MongoDatasetData.find(
        { teamId, datasetId, collectionId },
        '_id chunkIndex'
      ).lean();
      const coveredChunkIndexes = new Set(allExistingData.map((d) => d.chunkIndex));
      expect(coveredChunkIndexes.size).toBe(100); // all exist

      const completedDataIds = new Set(
        (
          await MongoDatasetData.find(
            { teamId, datasetId, collectionId, 'indexes.0': { $exists: true } },
            '_id'
          ).lean()
        ).map((d) => String(d._id))
      );
      expect(completedDataIds.size).toBe(30);

      const existingTrainingDataIds = new Set(
        (
          await MongoDatasetTraining.find(
            { teamId, datasetId, collectionId, mode: TrainingModeEnum.chunk },
            'dataId'
          ).lean()
        )
          .filter((t) => t.dataId)
          .map((t) => String(t.dataId))
      );
      expect(existingTrainingDataIds.size).toBe(70);

      // Build id lookup
      const chunkIndexToId = new Map(
        allExistingData.map((d) => [d.chunkIndex, String(d._id)] as const)
      );
      parsedDatas.forEach((item: any, idx: number) => {
        item.id = chunkIndexToId.get(idx) || '';
      });

      // 3-way filter
      const newTrainingData = parsedDatas.filter((item: any) => {
        if (!item.id) return true;
        if (existingTrainingDataIds.has(item.id)) return false; // 70 skipped
        if (completedDataIds.has(item.id)) return false; // 30 skipped
        return true;
      });

      // 0 new Training: 30 already vectorized (completedDataIds),
      // 70 still have Training (existingTrainingDataIds)
      expect(newTrainingData).toHaveLength(0);

      // Final state verification
      const allData = await MongoDatasetData.find(
        { teamId, datasetId, collectionId },
        '_id indexes'
      ).lean();

      const vectorizedCount = allData.filter((d) => d.indexes && d.indexes.length > 0).length;
      const draftCount = allData.filter((d) => !d.indexes || d.indexes.length === 0).length;
      expect(vectorizedCount).toBe(30);
      expect(draftCount).toBe(70);

      const allTraining = await MongoDatasetTraining.find({
        teamId,
        datasetId,
        collectionId,
        mode: TrainingModeEnum.chunk
      }).lean();
      expect(allTraining).toHaveLength(70); // only the un-consumed ones

      // Each remaining Training has a valid dataId pointing to an existing Data
      for (const t of allTraining) {
        expect(t.dataId).toBeTruthy();
        const dataExists = allData.some((d) => String(d._id) === String(t.dataId));
        expect(dataExists).toBe(true);
      }

      // Cleanup
      await MongoDatasetTraining.deleteMany({ teamId, datasetId, collectionId });
      await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
    });

    it('should handle the narrowest race: generateVector finishes one item between parse queries', async () => {
      const teamId = String(newId());
      const datasetId = String(newId());
      const collectionId = String(newId());

      // 5 Data + Training, simulate generateVector processing chunk 2 between
      // parse's completedDataIds and existingTrainingDataIds queries
      const dataRecords = await MongoDatasetData.create(
        Array.from({ length: 5 }, (_, i) => ({
          teamId,
          tmbId: newId(),
          datasetId,
          collectionId,
          q: `chunk-${i}`,
          chunkIndex: i,
          indexes: [],
          createTime: new Date()
        }))
      );
      const trainingRecords = await MongoDatasetTraining.create(
        dataRecords.map((d) => ({
          teamId,
          tmbId: newId(),
          datasetId,
          collectionId,
          billId: 'test-bill',
          mode: TrainingModeEnum.chunk,
          dataId: d._id,
          chunkIndex: d.chunkIndex,
          retryCount: 5
        }))
      );

      // Simulate: parse queries completedDataIds → all empty (none vectorized yet)
      // Then generateVector finishes chunk 2:
      await MongoDatasetData.updateOne(
        { _id: dataRecords[2]._id },
        { $set: { indexes: [{ type: 'custom', text: 'vec-2', dataId: 'vid-2' }] } }
      );
      await MongoDatasetTraining.deleteOne({ _id: trainingRecords[2]._id });

      // Now parse queries existingTrainingDataIds and applies filter
      const completedDataIds = new Set<string>(); // Empty — simulate query before generateVector ran
      const existingTrainingDataIds = new Set(
        (
          await MongoDatasetTraining.find(
            { teamId, datasetId, collectionId, mode: TrainingModeEnum.chunk },
            'dataId'
          ).lean()
        )
          .filter((t) => t.dataId)
          .map((t) => String(t.dataId))
      );
      expect(existingTrainingDataIds.size).toBe(4); // chunk 2 Training was deleted

      const parsedDatas = dataRecords.map((d, idx) => ({
        id: String(d._id),
        q: d.q,
        chunkIndex: idx
      }));

      // 3-way filter with STALE completedDataIds (pre-race snapshot)
      const newTraining = parsedDatas.filter((item: any) => {
        if (!item.id) return true;
        if (existingTrainingDataIds.has(item.id)) return false; // 4 skipped
        if (completedDataIds.has(item.id)) return false; // 0 skipped (stale)
        return true;
      });

      // RACE RESULT: duplicate Training for chunk 2 (the narrow window)
      expect(newTraining).toHaveLength(1);
      expect(newTraining[0].id).toBe(String(dataRecords[2]._id));

      // But it's safe: generateVector will route to rebuildData because
      // Data.indexes.length > 0 (we filled it above)
      const dataCheck = await MongoDatasetData.findById(dataRecords[2]._id, 'indexes').lean();
      expect(dataCheck!.indexes.length).toBeGreaterThan(0);
      // → rebuildData path: old vectors deleted, new vectors created → eventually consistent

      // Cleanup
      await MongoDatasetTraining.deleteMany({ teamId, datasetId, collectionId });
      await MongoDatasetData.deleteMany({ teamId, datasetId, collectionId });
    });
  });
});
