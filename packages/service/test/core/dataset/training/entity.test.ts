import { afterEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  hasDatasetTrainingTask,
  hasRetryableTrainingTask
} from '@fastgpt/service/core/dataset/training/entity';

const teamId = new Types.ObjectId();
const tmbId = new Types.ObjectId();
const datasetId = new Types.ObjectId();
const collectionId = new Types.ObjectId();

const scope = { teamId, datasetId };
const query = () => ({ teamId: String(teamId), datasetId: String(datasetId) });

const createTraining = (overrides: Record<string, unknown> = {}) =>
  MongoDatasetTraining.create({
    teamId,
    tmbId,
    datasetId,
    collectionId,
    billId: 'bill',
    mode: TrainingModeEnum.auto,
    ...overrides
  });

const createData = (indexStatus: DatasetDataIndexStatusEnum) =>
  MongoDatasetData.create({
    teamId,
    tmbId,
    datasetId,
    collectionId,
    q: 'q',
    indexStatus,
    indexes: []
  });

afterEach(async () => {
  await Promise.all([MongoDatasetTraining.deleteMany(scope), MongoDatasetData.deleteMany(scope)]);
});

describe('hasDatasetTrainingTask', () => {
  it('counts a queued training task as processing', async () => {
    await createTraining({
      retryCount: 3,
      lockTime: new Date('2000-01-01')
    });

    await expect(hasDatasetTrainingTask(query())).resolves.toBe(true);
  });

  it('does not count final errors or permanently locked tasks', async () => {
    await createTraining({
      retryCount: 0,
      lockTime: new Date('2049-12-31'),
      errorMsg: 'failed'
    });
    await createTraining({
      retryCount: 3,
      lockTime: new Date('2050-01-01'),
      errorMsg: 'blocked'
    });

    await expect(hasDatasetTrainingTask(query())).resolves.toBe(false);
  });

  it('counts pending rebuild data but not failed rebuild data', async () => {
    await createData(DatasetDataIndexStatusEnum.rebuildIndexPending);

    await expect(hasDatasetTrainingTask(query())).resolves.toBe(true);

    await MongoDatasetData.updateMany(scope, {
      $set: { indexStatus: DatasetDataIndexStatusEnum.rebuildIndexFailed }
    });
    await expect(hasDatasetTrainingTask(query())).resolves.toBe(false);
  });
});

describe('hasRetryableTrainingTask', () => {
  it('counts used or paused retries but not final errors', async () => {
    await createTraining({ retryCount: 3, lockTime: new Date('2000-01-01') });
    await createTraining({
      retryCount: 3,
      lockTime: new Date('2050-01-01'),
      errorMsg: 'AI points not enough'
    });

    await expect(hasRetryableTrainingTask(query())).resolves.toBe(true);

    await MongoDatasetTraining.deleteMany(scope);
    await createTraining({ retryCount: 0, lockTime: new Date(), errorMsg: 'failed' });
    await expect(hasRetryableTrainingTask(query())).resolves.toBe(false);
  });
});
