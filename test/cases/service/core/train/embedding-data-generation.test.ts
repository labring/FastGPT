import { describe, test, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import {
  createManualEmbeddingTrainData,
  updateEmbeddingTrainData,
  calculateEmbeddingTrainsetStats
} from '@fastgpt/service/core/train/embedding/data/controller';
import { embeddingTrainDataGenerateProcessor } from '@fastgpt/service/core/train/embedding/data/processor';
import {
  EmbeddingTrainsetStatusEnum,
  TrainDataSourceEnum
} from '@fastgpt/global/core/train/embedding/constants';
import { MongoEmbeddingTrainsetData } from '@fastgpt/service/core/train/embedding/data/schema';
import { MongoEmbeddingTrainset } from '@fastgpt/service/core/train/embedding/trainset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock MongoDB models
vi.mock('@fastgpt/service/core/train/embedding/data/schema', () => ({
  MongoEmbeddingTrainsetData: {
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    updateOne: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    insertMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue([{ _id: 'train_data_123' }])
  }
}));

vi.mock('@fastgpt/service/core/train/embedding/trainset/schema', () => ({
  MongoEmbeddingTrainset: {
    findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    updateOne: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 })
  }
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    countDocuments: vi.fn().mockResolvedValue(3),
    aggregate: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 })
  }
}));

vi.mock('@fastgpt/service/core/train/embedding/external', () => ({
  synthesizeEmbeddingTrainDatas: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/embedding/utils', async () => {
  const actual = await vi.importActual('@fastgpt/service/core/train/embedding/utils');
  return {
    ...actual,
    sampleDataFromDataset: vi.fn()
  };
});

describe('Embedding Train Data Generation', () => {
  let teamId: string;
  let tmbId: string;
  let trainsetId: string;
  let datasetId1: string;
  let datasetId2: string;

  beforeAll(async () => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    trainsetId = '507f1f77bcf86cd799439014';
    datasetId1 = '507f1f77bcf86cd799439015';
    datasetId2 = '507f1f77bcf86cd799439016';
  });

  afterAll(async () => {
    await Promise.all([
      MongoEmbeddingTrainsetData.deleteMany({ teamId }),
      MongoEmbeddingTrainset.deleteMany({ teamId })
    ]);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('embeddingTrainDataGenerateProcessor', () => {
    test('应该成功从 datasetIds 生成训练数据（不需要 appId）', async () => {
      // Mock trainset exists
      (MongoEmbeddingTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId,
        status: EmbeddingTrainsetStatusEnum.pending
      });

      // Mock data sampling
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/embedding/utils');
      (sampleDataFromDataset as any).mockResolvedValue([
        {
          datasetId: datasetId1,
          dataId: 'data_001',
          q: 'What is AI?',
          a: 'Artificial Intelligence',
          indexes: []
        },
        {
          datasetId: datasetId2,
          dataId: 'data_002',
          q: 'What is ML?',
          a: 'Machine Learning',
          indexes: []
        }
      ]);

      // Mock external service
      const { synthesizeEmbeddingTrainDatas } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );
      (synthesizeEmbeddingTrainDatas as any).mockResolvedValue({
        success: true,
        data: [
          {
            query: 'What is artificial intelligence?',
            positive: ['Artificial Intelligence'],
            negatives: ['Random text 1', 'Random text 2'],
            sourceId: 'data_001',
            datasetId: datasetId1
          }
        ]
      });

      (MongoEmbeddingTrainsetData.insertMany as any).mockResolvedValue([{ _id: 'train_data_1' }]);
      (MongoEmbeddingTrainset.updateOne as any).mockResolvedValue({});

      await embeddingTrainDataGenerateProcessor({
        data: {
          trainsetId,
          datasetIds: [datasetId1, datasetId2]
        },
        id: 'test-job-id',
        attemptsMade: 0,
        opts: { attempts: 1 }
      } as any);

      // Verify sampling via datasetIds directly, no appId dependency
      expect(sampleDataFromDataset).toHaveBeenCalled();
    });

    test('强制重新生成应该先清空旧数据', async () => {
      // Mock trainset
      (MongoEmbeddingTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId,
        status: EmbeddingTrainsetStatusEnum.pending
      });

      (MongoEmbeddingTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 2 });

      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/embedding/utils');
      (sampleDataFromDataset as any).mockResolvedValue([
        {
          datasetId: datasetId1,
          dataId: 'data_001',
          q: 'Test query',
          a: 'Test answer',
          indexes: []
        }
      ]);

      const { synthesizeEmbeddingTrainDatas } = await import(
        '@fastgpt/service/core/train/embedding/external'
      );
      (synthesizeEmbeddingTrainDatas as any).mockResolvedValue({
        success: true,
        data: [
          {
            query: 'Test query',
            positive: ['Test answer'],
            negatives: ['Random text'],
            sourceId: 'data_001',
            datasetId: datasetId1
          }
        ]
      });

      (MongoEmbeddingTrainsetData.insertMany as any).mockResolvedValue([{ _id: 'train_data_1' }]);
      (MongoEmbeddingTrainset.updateOne as any).mockResolvedValue({});

      await embeddingTrainDataGenerateProcessor({
        data: {
          trainsetId,
          datasetIds: [datasetId1],
          generateConfig: { forceRegenerate: true }
        },
        id: 'test-job-id',
        attemptsMade: 0,
        opts: { attempts: 1 }
      } as any);

      // Should delete existing data first with source filter
      expect(MongoEmbeddingTrainsetData.deleteMany).toHaveBeenCalledWith({
        trainsetId,
        source: TrainDataSourceEnum.dataset
      });
    });
  });

  describe('createManualEmbeddingTrainData', () => {
    test('应该成功创建手动训练数据', async () => {
      (MongoEmbeddingTrainsetData.create as any).mockResolvedValue([{ _id: 'manual_data_1' }]);

      const dataId = await createManualEmbeddingTrainData({
        trainsetId,
        query: 'What is embedding?',
        positiveDocs: ['Doc 1'],
        negativeDocs: ['Doc 2', 'Doc 3'],
        reason: 'Test data'
      });

      expect(dataId).toBe('manual_data_1');
      expect(MongoEmbeddingTrainsetData.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            trainsetId,
            query: 'What is embedding?',
            source: TrainDataSourceEnum.manual
          })
        ])
      );
    });
  });

  describe('updateEmbeddingTrainData', () => {
    test('应该成功更新训练数据', async () => {
      (MongoEmbeddingTrainsetData.updateOne as any).mockResolvedValue({ modifiedCount: 1 });

      await updateEmbeddingTrainData({
        dataId: 'data_123',
        query: 'Updated query',
        positiveDocs: ['Updated doc']
      });

      expect(MongoEmbeddingTrainsetData.updateOne).toHaveBeenCalled();
    });
  });

  describe('deleteEmbeddingTrainData', () => {
    test('应该成功删除训练数据', async () => {
      // Mock findById to return a proper data object
      (MongoEmbeddingTrainsetData.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'data-1',
          trainsetId: trainsetId
        })
      });

      (MongoEmbeddingTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 2 });

      const { deleteEmbeddingTrainData } = await import(
        '@fastgpt/service/core/train/embedding/data/controller'
      );

      const deletedCount = await deleteEmbeddingTrainData(['data-1', 'data-2']);

      expect(deletedCount).toBe(2);
      expect(MongoEmbeddingTrainsetData.deleteMany).toHaveBeenCalledWith({
        _id: { $in: ['data-1', 'data-2'] },
        trainsetId: trainsetId
      });
    });
  });

  describe('calculateEmbeddingTrainsetStats', () => {
    test('应该计算训练集统计信息', async () => {
      (MongoEmbeddingTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'data-1',
            positiveDocs: ['doc1'],
            negativeDocs: ['doc2', 'doc3'],
            source: TrainDataSourceEnum.dataset,
            metadata: {
              sourceInfo: {
                datasetInfo: { datasetId: datasetId1 }
              }
            }
          }
        ])
      });

      const stats = await calculateEmbeddingTrainsetStats(trainsetId);

      expect(stats).toEqual(
        expect.objectContaining({
          dataCount: expect.any(Number),
          positiveCount: expect.any(Number),
          negativeCount: expect.any(Number),
          sourceSummary: expect.any(Array)
        })
      );
    });
  });
});
