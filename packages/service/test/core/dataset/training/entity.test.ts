import { afterEach, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DatasetDataIndexStatusEnum } from '@fastgpt/global/core/dataset/data/constants';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { canSwitchEmbeddingModel } from '@fastgpt/service/core/dataset/training/entity';

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
    mode: TrainingModeEnum.index,
    ...overrides
  });

const createData = (indexStatus: DatasetDataIndexStatusEnum) =>
  MongoDatasetData.create({
    teamId,
    tmbId,
    datasetId,
    collectionId,
    q: 'q',
    indexes: [],
    indexStatus
  });

afterEach(async () => {
  await Promise.all([MongoDatasetTraining.deleteMany(scope), MongoDatasetData.deleteMany(scope)]);
});

describe('canSwitchEmbeddingModel', () => {
  it('allows switching when only final-error index and rebuild tasks exist', async () => {
    await createTraining({ retryCount: 0, errorMsg: 'failed' });
    await createTraining({
      mode: TrainingModeEnum.rebuildIndex,
      retryCount: 0,
      errorMsg: 'failed'
    });

    await expect(canSwitchEmbeddingModel(query())).resolves.toBe(true);
  });

  it('blocks switching for retryCount > 0 tasks, including locked ones', async () => {
    await createTraining({ retryCount: 3, lockTime: new Date('2000-01-01') });
    await expect(canSwitchEmbeddingModel(query())).resolves.toBe(false);

    await MongoDatasetTraining.deleteMany(scope);
    await createTraining({
      retryCount: 3,
      lockTime: new Date('2050-01-01'),
      errorMsg: 'blocked'
    });
    await expect(canSwitchEmbeddingModel(query())).resolves.toBe(false);
  });

  it('blocks switching for pre-stage tasks regardless of retryCount/errorMsg', async () => {
    await createTraining({ mode: TrainingModeEnum.auto, retryCount: 0, errorMsg: 'failed' });
    await expect(canSwitchEmbeddingModel(query())).resolves.toBe(false);
  });

  it('blocks switching for indexing and rebuilding data', async () => {
    await createData(DatasetDataIndexStatusEnum.indexing);
    await expect(canSwitchEmbeddingModel(query())).resolves.toBe(false);

    await MongoDatasetData.deleteMany(scope);
    await createData(DatasetDataIndexStatusEnum.rebuildIndexPending);
    await expect(canSwitchEmbeddingModel(query())).resolves.toBe(false);
  });
});
