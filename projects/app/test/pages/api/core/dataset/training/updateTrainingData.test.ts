import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handler } from '@/pages/api/core/dataset/training/updateTrainingData';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';

const datasetId = '507f1f77bcf86cd799439011';
const collectionId = '507f1f77bcf86cd799439012';
const dataId = '507f1f77bcf86cd799439013';
const foreignDatasetId = '507f1f77bcf86cd799439014';

vi.mock('@fastgpt/service/core/dataset/training/schema', () => ({
  MongoDatasetTraining: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetCollection: vi.fn()
}));

describe('updateTrainingData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authDatasetCollection).mockResolvedValue({
      collection: {
        _id: collectionId,
        teamId: 'team1',
        datasetId
      }
    });
  });

  it('should retry all error data when dataId is not provided', async () => {
    const req = {
      body: {
        collectionId
      }
    };

    await handler(req as any);

    expect(MongoDatasetTraining.updateMany).toHaveBeenCalledWith(
      {
        teamId: 'team1',
        datasetId,
        collectionId,
        errorMsg: { $exists: true, $ne: null }
      },
      {
        $unset: { errorMsg: '' },
        retryCount: 3,
        lockTime: new Date('2000')
      }
    );
  });

  it('should update single training data with image', async () => {
    vi.mocked(MongoDatasetTraining.findOne).mockResolvedValue({
      imageId: 'image1'
    });

    const req = {
      body: {
        collectionId,
        dataId,
        q: 'question',
        a: 'answer',
        chunkIndex: 1
      }
    };

    await handler(req as any);

    expect(MongoDatasetTraining.updateOne).toHaveBeenCalledWith(
      {
        teamId: 'team1',
        datasetId,
        collectionId,
        _id: dataId
      },
      {
        $unset: { errorMsg: '' },
        retryCount: 3,
        mode: TrainingModeEnum.chunk,
        q: 'question',
        a: 'answer',
        chunkIndex: 1,
        lockTime: new Date('2000')
      }
    );
  });

  it('should update single training data without image', async () => {
    vi.mocked(MongoDatasetTraining.findOne).mockResolvedValue({});

    const req = {
      body: {
        collectionId,
        dataId,
        q: 'question',
        a: 'answer',
        chunkIndex: 1
      }
    };

    await handler(req as any);

    expect(MongoDatasetTraining.updateOne).toHaveBeenCalledWith(
      {
        teamId: 'team1',
        datasetId,
        collectionId,
        _id: dataId
      },
      {
        $unset: { errorMsg: '' },
        retryCount: 3,
        q: 'question',
        a: 'answer',
        chunkIndex: 1,
        lockTime: new Date('2000')
      }
    );
  });

  it('should reject when data not found', async () => {
    vi.mocked(MongoDatasetTraining.findOne).mockResolvedValue(null);

    const req = {
      body: {
        collectionId,
        dataId
      }
    };

    await expect(handler(req as any)).rejects.toBe('data not found');
  });

  it('should ignore legacy request datasetId and use the authorized collection datasetId', async () => {
    vi.mocked(MongoDatasetTraining.findOne).mockResolvedValue({});

    const req = {
      body: {
        datasetId: foreignDatasetId,
        collectionId,
        dataId,
        q: 'question'
      }
    };

    await handler(req as any);

    expect(MongoDatasetTraining.findOne).toHaveBeenCalledWith({
      teamId: 'team1',
      datasetId,
      collectionId,
      _id: dataId
    });
    expect(MongoDatasetTraining.updateOne).toHaveBeenCalledWith(
      {
        teamId: 'team1',
        datasetId,
        collectionId,
        _id: dataId
      },
      expect.objectContaining({
        q: 'question'
      })
    );
  });
});
