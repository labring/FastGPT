import { describe, expect, it, vi, beforeEach } from 'vitest';
import { handler } from '@/pages/api/core/dataset/training/updateTrainingData';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import {
  authDataset,
  authDatasetCollection
} from '@fastgpt/service/support/permission/dataset/auth';
import { TrainingModeEnum } from '@fastgpt/global/core/dataset/constants';

const datasetId = '507f1f77bcf86cd799439011';
const collectionId = '507f1f77bcf86cd799439012';
const dataId = '507f1f77bcf86cd799439013';
const foreignDatasetId = '507f1f77bcf86cd799439014';

vi.mock('@fastgpt/service/core/dataset/training/schema', () => ({
  MongoDatasetTraining: {
    findById: vi.fn(),
    updateOne: vi.fn(),
    updateMany: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: vi.fn(),
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
    } as any);
    vi.mocked(authDataset).mockResolvedValue({
      teamId: 'team1',
      dataset: {
        _id: datasetId
      }
    } as any);
  });

  it('should retry only final errors in collection scope', async () => {
    await handler({
      body: {
        collectionId
      }
    } as any);

    expect(authDatasetCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionId
      })
    );
    expect(MongoDatasetTraining.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team1',
        datasetId,
        collectionId,
        $expr: expect.any(Object)
      }),
      {
        $unset: { errorMsg: '' },
        retryCount: 3,
        lockTime: new Date('2000')
      }
    );
  });

  it('should retry only final errors in dataset scope', async () => {
    await handler({
      body: {
        datasetId
      }
    } as any);

    expect(authDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        datasetId
      })
    );
    expect(MongoDatasetTraining.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team1',
        datasetId,
        $expr: expect.any(Object)
      }),
      {
        $unset: { errorMsg: '' },
        retryCount: 3,
        lockTime: new Date('2000')
      }
    );
  });

  it('should update single training data with collection boundary', async () => {
    vi.mocked(MongoDatasetTraining.findById).mockResolvedValue({
      _id: dataId,
      imageId: 'image1',
      teamId: 'team1',
      datasetId,
      collectionId
    });

    await handler({
      body: {
        dataId,
        q: 'question',
        a: 'answer',
        chunkIndex: 1
      }
    } as any);

    const match = {
      teamId: 'team1',
      datasetId,
      collectionId,
      _id: dataId
    };

    expect(MongoDatasetTraining.findById).toHaveBeenCalledWith(dataId);
    expect(authDatasetCollection).toHaveBeenCalledWith(
      expect.objectContaining({
        collectionId
      })
    );
    expect(MongoDatasetTraining.updateOne).toHaveBeenCalledWith(match, {
      $unset: { errorMsg: '' },
      retryCount: 3,
      mode: TrainingModeEnum.chunk,
      q: 'question',
      a: 'answer',
      chunkIndex: 1,
      lockTime: new Date('2000')
    });
  });

  it('should reject when single training data is not found', async () => {
    vi.mocked(MongoDatasetTraining.findById).mockResolvedValue(null);

    await expect(
      handler({
        body: {
          dataId
        }
      } as any)
    ).rejects.toBe('data not found');
  });

  it('should ignore legacy request datasetId and use the item collection datasetId', async () => {
    vi.mocked(MongoDatasetTraining.findById).mockResolvedValue({
      _id: dataId,
      teamId: 'team1',
      datasetId,
      collectionId
    });

    await handler({
      body: {
        datasetId: foreignDatasetId,
        dataId,
        q: 'question'
      }
    } as any);

    const match = {
      teamId: 'team1',
      datasetId,
      collectionId,
      _id: dataId
    };

    expect(MongoDatasetTraining.findById).toHaveBeenCalledWith(dataId);
    expect(MongoDatasetTraining.updateOne).toHaveBeenCalledWith(
      match,
      expect.objectContaining({
        q: 'question'
      })
    );
  });

  it('should reject when the item collection boundary is inconsistent', async () => {
    vi.mocked(MongoDatasetTraining.findById).mockResolvedValue({
      _id: dataId,
      teamId: 'team1',
      datasetId: foreignDatasetId,
      collectionId
    });

    await expect(
      handler({
        body: {
          dataId
        }
      } as any)
    ).rejects.toBe('data not found');

    expect(MongoDatasetTraining.updateOne).not.toHaveBeenCalled();
  });
});