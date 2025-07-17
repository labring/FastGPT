import { vi, describe, it, expect, beforeEach } from 'vitest';
import { generateVector, reduceQueue } from '@/service/core/dataset/queues/generateVector';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { checkTeamAiPointsAndLock } from '@/service/core/dataset/queues/utils';
import { pushGenerateVectorUsage } from '@/service/support/wallet/usage/push';
import { delay } from '@fastgpt/service/common/bullmq';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import {
  insertDatasetDataVector,
  deleteDatasetDataVector
} from '@fastgpt/service/common/vectorDB/controller';
import { insertData2Dataset } from '@/service/core/dataset/data/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    findOneAndUpdate: vi.fn(),
    updateOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/dataset/training/schema', () => ({
  MongoDatasetTraining: {
    findOneAndUpdate: vi.fn(),
    deleteOne: vi.fn(),
    updateOne: vi.fn(),
    create: vi.fn()
  }
}));

vi.mock('@/service/support/wallet/usage/push', () => ({
  pushGenerateVectorUsage: vi.fn()
}));

vi.mock('@/service/core/dataset/queues/utils', () => ({
  checkTeamAiPointsAndLock: vi.fn()
}));

vi.mock('@fastgpt/service/common/bullmq', () => ({
  delay: vi.fn()
}));

vi.mock('@fastgpt/service/common/vectorDB/controller', () => ({
  insertDatasetDataVector: vi.fn(),
  deleteDatasetDataVector: vi.fn()
}));

vi.mock('@/service/core/dataset/data/controller', () => ({
  insertData2Dataset: vi.fn()
}));

vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn()
}));

describe('generateVector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.vectorQueueLen = 0;
    global.systemEnv = { vectorMaxProcess: 10 };
    vi.mocked(mongoSessionRun).mockImplementation(async (fn) => fn({}));
    vi.mocked(delay).mockResolvedValue(undefined);
  });

  it('should not process when queue is full', async () => {
    global.vectorQueueLen = 10;
    await generateVector();
    expect(MongoDatasetTraining.findOneAndUpdate).not.toBeCalled();
  });

  it('should handle no training data', async () => {
    // Simulate no data found (done: true branch)
    vi.mocked(MongoDatasetTraining.findOneAndUpdate as any).mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValueOnce(null)
    });
    await generateVector();
    expect(global.vectorQueueLen).toBe(0);
  });

  it('should handle database error', async () => {
    // Simulate error thrown in findOneAndUpdate (error: true branch)
    vi.mocked(MongoDatasetTraining.findOneAndUpdate as any).mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockImplementationOnce(() => {
        throw new Error('DB Error');
      })
    });
    // For the new code, delay(500) is only called if error is returned and the loop continues.
    // But since there is no data, after the error, the loop will break.
    await generateVector();
    expect(vi.mocked(delay)).not.toHaveBeenCalledWith(500);
  });

  it('should handle missing dataset or collection', async () => {
    const mockTrainingData = {
      _id: 'testId',
      dataset: null,
      collection: null
    };
    // The code expects .lean() to return the data, so we simulate that
    vi.mocked(MongoDatasetTraining.findOneAndUpdate as any).mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValueOnce(mockTrainingData)
    });
    vi.mocked(MongoDatasetTraining.deleteOne).mockResolvedValueOnce({} as any);

    await generateVector();
    expect(vi.mocked(MongoDatasetTraining.deleteOne)).toHaveBeenCalledWith({ _id: 'testId' });
  });

  it('should handle insufficient team points', async () => {
    const mockTrainingData = {
      _id: 'testId',
      teamId: 'team1',
      dataset: { vectorModel: 'test-model' },
      collection: { name: 'test' }
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate as any).mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValueOnce(mockTrainingData)
    });
    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValueOnce(false);

    await generateVector();
    expect(vi.mocked(checkTeamAiPointsAndLock)).toHaveBeenCalledWith('team1');
  });

  it('should process training data successfully for rebuild', async () => {
    const mockTrainingData = {
      _id: 'testId',
      teamId: 'team1',
      tmbId: 'tmb1',
      datasetId: 'dataset1',
      collectionId: 'collection1',
      dataset: { vectorModel: 'test-model' },
      collection: { name: 'test', indexPrefixTitle: true },
      data: { _id: 'dataId', indexes: [{ text: 'test', dataId: 'oldVectorId' }] },
      billId: 'bill1',
      dataId: 'data1'
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate as any).mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValueOnce(mockTrainingData)
    });
    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValueOnce(true);
    vi.mocked(insertDatasetDataVector).mockResolvedValueOnce({
      tokens: 100,
      insertId: 'vector1'
    });
    vi.mocked(MongoDatasetData.updateOne).mockResolvedValueOnce({} as any);
    vi.mocked(deleteDatasetDataVector).mockResolvedValueOnce();
    vi.mocked(MongoDatasetTraining.deleteOne).mockResolvedValueOnce({} as any);

    // The rebuildData function will also call MongoDatasetData.findOneAndUpdate and MongoDatasetTraining.create
    vi.mocked(MongoDatasetData.findOneAndUpdate).mockResolvedValueOnce(null);

    await generateVector();

    expect(vi.mocked(pushGenerateVectorUsage)).toHaveBeenCalledWith({
      teamId: 'team1',
      tmbId: 'tmb1',
      inputTokens: 100,
      model: 'test-model',
      billId: 'bill1'
    });
  });

  it('should process training data successfully for insert', async () => {
    const mockTrainingData = {
      _id: 'testId',
      teamId: 'team1',
      tmbId: 'tmb1',
      datasetId: 'dataset1',
      collectionId: 'collection1',
      dataset: { vectorModel: 'test-model' },
      collection: { name: 'test', indexPrefixTitle: true },
      billId: 'bill1',
      q: 'test question',
      a: 'test answer'
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate as any).mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValueOnce(mockTrainingData)
    });
    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValueOnce(true);
    vi.mocked(insertData2Dataset).mockResolvedValueOnce({ tokens: 100 });
    vi.mocked(MongoDatasetTraining.deleteOne).mockResolvedValueOnce({} as any);

    await generateVector();

    expect(vi.mocked(pushGenerateVectorUsage)).toHaveBeenCalledWith({
      teamId: 'team1',
      tmbId: 'tmb1',
      inputTokens: 100,
      model: 'test-model',
      billId: 'bill1'
    });
  });

  it('should handle error in processing and update errorMsg', async () => {
    const mockTrainingData = {
      _id: 'testId',
      teamId: 'team1',
      tmbId: 'tmb1',
      datasetId: 'dataset1',
      collectionId: 'collection1',
      dataset: { vectorModel: 'test-model' },
      collection: { name: 'test', indexPrefixTitle: true },
      data: { _id: 'dataId', indexes: [{ text: 'test', dataId: 'oldVectorId' }] },
      billId: 'bill1',
      dataId: 'data1'
    };
    vi.mocked(MongoDatasetTraining.findOneAndUpdate as any).mockReturnValueOnce({
      populate: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValueOnce(mockTrainingData)
    });
    vi.mocked(checkTeamAiPointsAndLock).mockResolvedValueOnce(true);
    vi.mocked(insertDatasetDataVector).mockImplementationOnce(() => {
      throw new Error('vector error');
    });
    vi.mocked(MongoDatasetTraining.updateOne).mockResolvedValueOnce({} as any);
    vi.mocked(MongoDatasetData.findOneAndUpdate).mockResolvedValueOnce(null);

    await generateVector();

    expect(vi.mocked(MongoDatasetTraining.updateOne)).toHaveBeenCalledWith(
      { _id: 'testId' },
      expect.objectContaining({ errorMsg: expect.any(String) })
    );
    expect(vi.mocked(delay)).toHaveBeenCalledWith(100);
  });
});

describe('reduceQueue', () => {
  beforeEach(() => {
    global.vectorQueueLen = 0;
  });

  it('should reduce queue and return true when queue becomes empty', () => {
    global.vectorQueueLen = 1;
    expect(reduceQueue()).toBe(true);
    expect(global.vectorQueueLen).toBe(0);
  });

  it('should reduce queue and return false when queue is not empty', () => {
    global.vectorQueueLen = 2;
    expect(reduceQueue()).toBe(false);
    expect(global.vectorQueueLen).toBe(1);
  });

  it('should handle negative queue length', () => {
    global.vectorQueueLen = -1;
    expect(reduceQueue()).toBe(true);
    expect(global.vectorQueueLen).toBe(0);
  });
});
