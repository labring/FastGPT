/**
 * Test listV2.ts key logic affected by the training status tracking changes.
 *
 * Covers:
 *   - getFileStatus: status calculation using precomputed stats (hasError/errorCount/allParse)
 *   - getErrorCountMap: aggregation now filters retryCount <= 0 (terminal errors only)
 *
 * Run (from repo root):
 *   MONGODB_TEST_URI="mongodb://myusername:mypassword@127.0.0.1:30017/fastgpt?authSource=admin&directConnection=true" \
 *   node_modules/.bin/vitest run test/cases/service/core/dataset/collection/listV2.test.ts
 */
import { describe, it, expect } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import { TrainingModeEnum, CollectionStatusEnum } from '@fastgpt/global/core/dataset/constants';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { getFileStatus, getErrorCountMap } from '@/pages/api/core/dataset/collection/listV2';

const newId = () => new Types.ObjectId();

// ============================================================================
// Tests: getFileStatus
// ============================================================================
describe('getFileStatus', () => {
  it('should return queued when statsUpdatedAt is missing (not yet initialized)', () => {
    const status = getFileStatus({
      dataAmount: 10,
      trainingAmount: 0,
      hasError: false,
      errorCount: 0,
      allParse: true,
      statsUpdatedAt: undefined
    });
    expect(status).toBe(CollectionStatusEnum.queued);
  });

  it('should return error when errorCount equals dataAmount', () => {
    const status = getFileStatus({
      dataAmount: 3,
      trainingAmount: 0,
      hasError: true,
      errorCount: 3,
      allParse: false,
      statsUpdatedAt: new Date()
    });
    expect(status).toBe(CollectionStatusEnum.error);
  });

  it('should return error when dataAmount is 0 and errorCount > 0', () => {
    const status = getFileStatus({
      dataAmount: 0,
      trainingAmount: 0,
      hasError: true,
      errorCount: 2,
      allParse: false,
      statsUpdatedAt: new Date()
    });
    expect(status).toBe(CollectionStatusEnum.error);
  });

  it('should return ready when all data processed without error', () => {
    const status = getFileStatus({
      dataAmount: 5,
      trainingAmount: 0,
      hasError: false,
      errorCount: 0,
      allParse: true,
      statsUpdatedAt: new Date(),
      processedCount: 5
    });
    expect(status).toBe(CollectionStatusEnum.ready);
  });

  it('should return queued when allParse=true but parseStartTime is not set', () => {
    const status = getFileStatus({
      dataAmount: 10,
      trainingAmount: 3,
      hasError: false,
      errorCount: 0,
      allParse: true,
      parseStartTime: undefined,
      statsUpdatedAt: new Date()
    });
    expect(status).toBe(CollectionStatusEnum.queued);
  });

  it('should return parsing when allParse=true and parseStartTime is set', () => {
    const status = getFileStatus({
      dataAmount: 10,
      trainingAmount: 3,
      hasError: false,
      errorCount: 0,
      allParse: true,
      parseStartTime: new Date(),
      statsUpdatedAt: new Date()
    });
    expect(status).toBe(CollectionStatusEnum.parsing);
  });

  it('should return indexing when any training is non-parse (allParse=false)', () => {
    const status = getFileStatus({
      dataAmount: 10,
      trainingAmount: 3,
      hasError: false,
      errorCount: 0,
      allParse: false,
      parseStartTime: new Date(),
      statsUpdatedAt: new Date()
    });
    expect(status).toBe(CollectionStatusEnum.indexing);
  });

  it('should return indexing when processedCount < dataAmount after training done', () => {
    const status = getFileStatus({
      dataAmount: 10,
      trainingAmount: 0,
      hasError: false,
      errorCount: 0,
      allParse: true,
      statsUpdatedAt: new Date(),
      processedCount: 3
    });
    expect(status).toBe(CollectionStatusEnum.indexing);
  });

  it('should return queued when training=0 processedCount=0 but dataAmount > 0', () => {
    const status = getFileStatus({
      dataAmount: 10,
      trainingAmount: 0,
      hasError: false,
      errorCount: 0,
      allParse: true,
      statsUpdatedAt: new Date(),
      processedCount: 0
    });
    expect(status).toBe(CollectionStatusEnum.queued);
  });

  it('should return notExist when table schema does not exist', () => {
    const status = getFileStatus({
      dataAmount: 10,
      trainingAmount: 0,
      tableSchemaExist: false,
      statsUpdatedAt: new Date()
    });
    expect(status).toBe(CollectionStatusEnum.notExist);
  });

  it('should return indexing instead of error when errorCount < dataAmount (partial errors)', () => {
    const status = getFileStatus({
      dataAmount: 5,
      trainingAmount: 3,
      hasError: true,
      errorCount: 2,
      allParse: false,
      statsUpdatedAt: new Date(),
      processedCount: 1
    });
    expect(status).toBe(CollectionStatusEnum.indexing);
  });
});

// ============================================================================
// Tests: getErrorCountMap aggregation
// ============================================================================
describe('getErrorCountMap aggregation', () => {
  it('should return empty map when no collectionIds provided', async () => {
    const map = await getErrorCountMap(String(newId()), String(newId()), []);
    expect(map.size).toBe(0);
  });

  it('should return 0 for collections with no errors', async () => {
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
        retryCount: 3
      }
    ]);

    const map = await getErrorCountMap(String(teamId), String(datasetId), [collectionId]);
    expect(map.get(String(collectionId))).toBeUndefined();
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
        retryCount: 3,
        errorMsg: 'API timeout'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b2',
        mode: TrainingModeEnum.parse,
        retryCount: 1,
        errorMsg: 'Network error'
      }
    ]);

    const map = await getErrorCountMap(String(teamId), String(datasetId), [collectionId]);
    expect(map.get(String(collectionId))).toBeUndefined();
  });

  it('should only count terminal errors (retryCount <= 0 + errorMsg)', async () => {
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
        mode: TrainingModeEnum.chunk,
        retryCount: 0,
        errorMsg: 'OOM'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b3',
        mode: TrainingModeEnum.parse,
        retryCount: 4,
        errorMsg: 'timeout'
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

    const map = await getErrorCountMap(String(teamId), String(datasetId), [collectionId]);
    expect(map.get(String(collectionId))).toBe(2);
  });

  it('should correctly map error counts per collection', async () => {
    const teamId = newId();
    const datasetId = newId();
    const col1 = newId();
    const col2 = newId();
    const col3 = newId();

    await MongoDatasetTraining.insertMany([
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId: col1,
        billId: 'b1',
        mode: TrainingModeEnum.parse,
        retryCount: 0,
        errorMsg: 'err1'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId: col2,
        billId: 'b2',
        mode: TrainingModeEnum.chunk,
        retryCount: 0,
        errorMsg: 'err2'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId: col2,
        billId: 'b3',
        mode: TrainingModeEnum.parse,
        retryCount: 0,
        errorMsg: 'err3'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId: col2,
        billId: 'b4',
        mode: TrainingModeEnum.parse,
        retryCount: 2,
        errorMsg: 'transient'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId: col3,
        billId: 'b5',
        mode: TrainingModeEnum.parse,
        retryCount: 5
      }
    ]);

    const map = await getErrorCountMap(String(teamId), String(datasetId), [col1, col2, col3]);
    expect(map.get(String(col1))).toBe(1);
    expect(map.get(String(col2))).toBe(2);
    expect(map.get(String(col3))).toBeUndefined();
  });

  it('should return empty map when all errors are transient', async () => {
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
        retryCount: 3,
        errorMsg: 'timeout'
      },
      {
        teamId,
        tmbId: newId(),
        datasetId,
        collectionId,
        billId: 'b2',
        mode: TrainingModeEnum.parse,
        retryCount: 1,
        errorMsg: 'network'
      }
    ]);

    const map = await getErrorCountMap(String(teamId), String(datasetId), [collectionId]);
    expect(map.size).toBe(0);
  });
});

// ============================================================================
// Integration: getFileStatus with post-change semantics
// ============================================================================
describe('getFileStatus integration with new error semantics', () => {
  it('should show indexing when hasError=true but only partial terminal errors with active training', () => {
    const status = getFileStatus({
      dataAmount: 10,
      trainingAmount: 5,
      hasError: true,
      errorCount: 2,
      allParse: false,
      statsUpdatedAt: new Date(),
      processedCount: 3
    });
    expect(status).toBe(CollectionStatusEnum.indexing);
  });

  it('should show ready when hasError=false and errorCount=0 (transient errors filtered)', () => {
    const status = getFileStatus({
      dataAmount: 10,
      trainingAmount: 0,
      hasError: false,
      errorCount: 0,
      allParse: true,
      statsUpdatedAt: new Date(),
      processedCount: 10
    });
    expect(status).toBe(CollectionStatusEnum.ready);
  });

  it('ALL terminal errors should show error status', () => {
    const status = getFileStatus({
      dataAmount: 3,
      trainingAmount: 0,
      hasError: true,
      errorCount: 3,
      allParse: false,
      statsUpdatedAt: new Date()
    });
    expect(status).toBe(CollectionStatusEnum.error);
  });
});
