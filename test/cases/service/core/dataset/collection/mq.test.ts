/**
 * Test the training aggregation pipeline used by CollectionUpdateWorker (mq.ts).
 *
 * Covers the changed fields:
 *   - hasError: only terminal errors (retryCount <= 0 + errorMsg) count
 *   - errorCount: same as hasError but counted
 *   - allParse: all training records must be parse mode (regardless of error state)
 *
 * Run (from repo root):
 *   MONGODB_TEST_URI="mongodb://myusername:mypassword@127.0.0.1:30017/fastgpt?authSource=admin&directConnection=true" \
 *   node_modules/.bin/vitest run test/cases/service/core/dataset/collection/mq.test.ts
 */
import { describe, it, expect } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import {
  buildTrainingAggregationPipeline,
  buildDataAggregationPipeline,
  type TrainingAggregationResult,
  type DataAggregationResult
} from '@fastgpt/service/core/dataset/collection/mq';

// Shared identity for all records in a test case
const newId = () => new Types.ObjectId();

async function runTrainingAggregation(
  teamId: Types.ObjectId,
  datasetId: Types.ObjectId,
  collectionId: Types.ObjectId
) {
  const [result] = await MongoDatasetTraining.aggregate<TrainingAggregationResult>(
    buildTrainingAggregationPipeline(teamId, datasetId, collectionId)
  );
  return result;
}

async function runDataAggregation(
  teamId: Types.ObjectId,
  datasetId: Types.ObjectId,
  collectionId: Types.ObjectId
) {
  const [result] = await MongoDatasetData.aggregate<DataAggregationResult>(
    buildDataAggregationPipeline(teamId, datasetId, collectionId)
  );
  return result;
}

// ============================================================================
// Tests: hasError & errorCount
// ============================================================================
describe('hasError / errorCount aggregation', () => {
  it('should be false/0 when no training records exist', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    const result = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(result).toBeUndefined(); // no records → no $group result
  });

  it('should be false/0 when no records have errors', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    await MongoDatasetTraining.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b1',
        mode: TrainingModeEnum.parse,
        retryCount: 3
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b2',
        mode: TrainingModeEnum.parse,
        retryCount: 5
      }
    ]);

    const result = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(result?.hasError).toBe(false);
    expect(result?.errorCount).toBe(0);
  });

  it('should NOT count transient errors (retryCount > 0 + errorMsg)', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    await MongoDatasetTraining.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b1',
        mode: TrainingModeEnum.parse,
        retryCount: 2,
        errorMsg: 'API timeout'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b2',
        mode: TrainingModeEnum.parse,
        retryCount: 5
      }
    ]);

    const result = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(result?.hasError).toBe(false);
    expect(result?.errorCount).toBe(0);
  });

  it('should count terminal errors (retryCount <= 0 + errorMsg)', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    await MongoDatasetTraining.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b1',
        mode: TrainingModeEnum.parse,
        retryCount: 0,
        errorMsg: 'Out of memory'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b2',
        mode: TrainingModeEnum.parse,
        retryCount: 5
      }
    ]);

    const result = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(result?.hasError).toBe(true);
    expect(result?.errorCount).toBe(1);
  });

  it('should count only terminal errors among mixed transient/terminal records', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    await MongoDatasetTraining.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b1',
        mode: TrainingModeEnum.parse,
        retryCount: 0,
        errorMsg: 'Quota exceeded'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b2',
        mode: TrainingModeEnum.qa,
        retryCount: -1,
        errorMsg: 'Internal error'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b3',
        mode: TrainingModeEnum.parse,
        retryCount: 3,
        errorMsg: 'API timeout'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b4',
        mode: TrainingModeEnum.parse,
        retryCount: 5
      }
    ]);

    const result = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(result?.hasError).toBe(true);
    expect(result?.errorCount).toBe(2);
  });

  it('should be false when errorMsg exists but retryCount is still positive', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    await MongoDatasetTraining.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b1',
        mode: TrainingModeEnum.parse,
        retryCount: 4,
        errorMsg: 'Previous failure'
      }
    ]);

    const result = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(result?.hasError).toBe(false);
    expect(result?.errorCount).toBe(0);
  });
});

// ============================================================================
// Tests: allParse
// ============================================================================
describe('allParse aggregation', () => {
  it('should be true when no training records exist (default fallback)', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    const result = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(result).toBeUndefined();

    // The worker code falls back to `true`:
    //   allParse: trainingResult ? trainingResult.allParse : true
    expect(result ?? { allParse: true }).toEqual({ allParse: true });
  });

  it('should be true when ALL records are parse mode', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    await MongoDatasetTraining.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b1',
        mode: TrainingModeEnum.parse,
        retryCount: 3
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b2',
        mode: TrainingModeEnum.parse,
        retryCount: 5
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b3',
        mode: TrainingModeEnum.parse,
        retryCount: 0,
        errorMsg: 'failed'
      }
    ]);

    const result = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(result?.allParse).toBe(true);
  });

  it('should be false when ANY record is non-parse mode (even if terminal error)', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    await MongoDatasetTraining.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b1',
        mode: TrainingModeEnum.parse,
        retryCount: 3
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b2',
        mode: TrainingModeEnum.auto,
        retryCount: 0,
        errorMsg: 'failed'
      }
    ]);

    const result = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(result?.allParse).toBe(false);
  });

  it('should be false when records are mix of parse and non-parse modes', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    await MongoDatasetTraining.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b1',
        mode: TrainingModeEnum.parse,
        retryCount: 5
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b2',
        mode: TrainingModeEnum.chunk,
        retryCount: 5
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b3',
        mode: TrainingModeEnum.qa,
        retryCount: 5
      }
    ]);

    const result = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(result?.allParse).toBe(false);
  });

  it('should be false when ALL records are non-parse (even terminal errors)', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    await MongoDatasetTraining.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b1',
        mode: TrainingModeEnum.auto,
        retryCount: 0,
        errorMsg: 'failed'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b2',
        mode: TrainingModeEnum.qa,
        retryCount: 0,
        errorMsg: 'failed'
      }
    ]);

    const result = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(result?.allParse).toBe(false);
  });
});

// ============================================================================
// Tests: data aggregation (dataAmount / processedCount / remainingCount)
// ============================================================================
describe('data aggregation', () => {
  it('should count all data records and those with indexingCompleteTime', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    await MongoDatasetData.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: 'q1',
        indexes: [],
        indexingCompleteTime: new Date()
      },
      { teamId, tmbId: newId(), datasetId, collectionId, q: 'q2', indexes: [] },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: 'q3',
        indexes: [],
        indexingCompleteTime: new Date()
      }
    ]);

    const result = await runDataAggregation(teamId, datasetId, collectionId);
    expect(result?.count).toBe(3);
    expect(result?.processedCount).toBe(2);
  });

  it('should return 0s when no data records exist', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    const result = await runDataAggregation(teamId, datasetId, collectionId);
    expect(result).toBeUndefined();
  });
});

// ============================================================================
// Integration: combined training + data aggregation → collection update
// ============================================================================
describe('collection stats update (training + data)', () => {
  it('should compute correct stats for a realistic mixed scenario', async () => {
    const teamId = newId();
    const datasetId = newId();
    const collectionId = newId();

    // ---- data ----
    await MongoDatasetData.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: 'q1',
        indexes: [],
        indexingCompleteTime: new Date()
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        q: 'q2',
        indexes: [],
        indexingCompleteTime: new Date()
      },
      { teamId, tmbId: newId(), datasetId, collectionId, q: 'q3', indexes: [] }
    ]);

    // ---- training ----
    await MongoDatasetTraining.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b1',
        mode: TrainingModeEnum.parse,
        retryCount: 3
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b2',
        mode: TrainingModeEnum.parse,
        retryCount: 5
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b3',
        mode: TrainingModeEnum.chunk,
        retryCount: 4
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b4',
        mode: TrainingModeEnum.parse,
        retryCount: 2,
        errorMsg: 'timeout'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b5',
        mode: TrainingModeEnum.parse,
        retryCount: 0,
        errorMsg: 'quota exceeded'
      }
    ]);

    // ---- run both aggregations ----
    const [dataResult] = await MongoDatasetData.aggregate<DataAggregationResult>(
      buildDataAggregationPipeline(teamId, datasetId, collectionId)
    );

    const trainingResult = await runTrainingAggregation(teamId, datasetId, collectionId);

    // ---- write to collection (mirrors mq.ts lines 107–124) ----
    const dataCount = dataResult?.count ?? 0;
    const processedCount = dataResult?.processedCount ?? 0;

    await MongoDatasetCollection.updateOne(
      { _id: collectionId },
      {
        $set: {
          dataAmount: dataCount,
          trainingAmount: trainingResult?.count ?? 0,
          processedCount,
          remainingCount: dataCount - processedCount,
          hasError: trainingResult?.hasError ?? false,
          errorCount: trainingResult?.errorCount ?? 0,
          allParse: trainingResult ? trainingResult.allParse : true,
          statsUpdatedAt: new Date(),
          updateTime: new Date()
        }
      },
      { upsert: true }
    );

    // ---- assert ----
    const updated = await MongoDatasetCollection.findById(collectionId).lean();

    expect(updated?.dataAmount).toBe(3);
    expect(updated?.trainingAmount).toBe(5);
    expect(updated?.processedCount).toBe(2);
    expect(updated?.remainingCount).toBe(1);
    expect(updated?.hasError).toBe(true);
    expect(updated?.errorCount).toBe(1);
    expect(updated?.allParse).toBe(false);

    // Edge case: allParse should still be false even if chunk record becomes terminal error
    await MongoDatasetTraining.updateOne(
      { billId: 'b3' },
      { $set: { retryCount: 0, errorMsg: 'failed' } }
    );

    const trainingResult2 = await runTrainingAggregation(teamId, datasetId, collectionId);
    expect(trainingResult2?.allParse).toBe(false);
  });
});
