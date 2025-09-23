import { describe, expect, it, vi } from 'vitest';
import { handler } from '@/pages/api/core/dataset/training/updateTrainingData';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';

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
  it('should retry all error data when dataId is not provided', async () => {
    vi.mocked(authDatasetCollection).mockResolvedValue({
      teamId: 'team1'
    });

    const req = {
      body: {
        datasetId: 'dataset1',
        collectionId: 'collection1'
      }
    };

    await handler(req as any);

    expect(MongoDatasetTraining.updateMany).toHaveBeenCalledWith(
      {
        teamId: 'team1',
        datasetId: 'dataset1',
        collectionId: 'collection1',
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
    vi.mocked(authDatasetCollection).mockResolvedValue({
      teamId: 'team1'
    });

    vi.mocked(MongoDatasetTraining.findOne).mockResolvedValue({
      imageId: 'image1'
    });

    const req = {
      body: {
        datasetId: 'dataset1',
        collectionId: 'collection1',
        dataId: 'data1',
        q: 'question',
        a: 'answer',
        chunkIndex: 1
      }
    };

    await handler(req as any);

    expect(MongoDatasetTraining.updateOne).toHaveBeenCalledWith(
      {
        teamId: 'team1',
        datasetId: 'dataset1',
        _id: 'data1'
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
    vi.mocked(authDatasetCollection).mockResolvedValue({
      teamId: 'team1'
    });

    vi.mocked(MongoDatasetTraining.findOne).mockResolvedValue({});

    const req = {
      body: {
        datasetId: 'dataset1',
        collectionId: 'collection1',
        dataId: 'data1',
        q: 'question',
        a: 'answer',
        chunkIndex: 1
      }
    };

    await handler(req as any);

    expect(MongoDatasetTraining.updateOne).toHaveBeenCalledWith(
      {
        teamId: 'team1',
        datasetId: 'dataset1',
        _id: 'data1'
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
    vi.mocked(authDatasetCollection).mockResolvedValue({
      teamId: 'team1'
    });

    vi.mocked(MongoDatasetTraining.findOne).mockResolvedValue(null);

    const req = {
      body: {
        datasetId: 'dataset1',
        collectionId: 'collection1',
        dataId: 'data1'
      }
    };

    await expect(handler(req as any)).rejects.toBe('data not found');
  });
});
