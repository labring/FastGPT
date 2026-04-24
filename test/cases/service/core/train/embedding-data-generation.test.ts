import { describe, test, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';

// Use vi.hoisted to set environment variables before all module imports
vi.hoisted(() => {
  process.env.TRAIN_MIN_CHUNK_COUNT = '1';
});
import {
  createManualEmbeddingTrainData,
  updateEmbeddingTrainData,
  calculateEmbeddingTrainsetStats
} from '@fastgpt/service/core/train/embedding/data/controller';
import { embeddingTrainDataGenerateProcessor } from '@fastgpt/service/core/train/embedding/data/processor';
import {
  EmbeddingTrainsetStatusEnum,
  EmbeddingTrainDataSourceEnum
} from '@fastgpt/global/core/train/embedding/constants';
import { MongoEmbeddingTrainsetData } from '@fastgpt/service/core/train/embedding/data/schema';
import { MongoEmbeddingTrainset } from '@fastgpt/service/core/train/embedding/trainset/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { createMockDoc } from './mockDoc';

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

vi.mock('@fastgpt/service/core/train/common/synthesize/buildFineTuneData', () => ({
  buildFineTuneDataStream: vi.fn()
}));

// mongoSessionRun: execute the callback with a fake session object so transaction logic is testable
vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn().mockImplementation(async (fn: any) => fn({}))
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
    test('应该成功从 datasetIds 生成训练数据', async () => {
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
          collectionId: 'col_001'
        },
        {
          datasetId: datasetId2,
          dataId: 'data_002',
          collectionId: 'col_002'
        }
      ]);

      // Mock external service
      const { buildFineTuneDataStream } = await import(
        '@fastgpt/service/core/train/common/synthesize/buildFineTuneData'
      );
      async function* mockStream() {
        yield {
          query: 'What is artificial intelligence?',
          positive: ['Artificial Intelligence'],
          negatives: ['Random text 1', 'Random text 2'],
          sourceId: 'data_001',
          datasetId: datasetId1
        };
      }
      (buildFineTuneDataStream as any).mockReturnValue(mockStream());

      (MongoEmbeddingTrainsetData.insertMany as any).mockResolvedValue([{ _id: 'train_data_1' }]);
      (MongoEmbeddingTrainset.updateOne as any).mockResolvedValue({});

      await embeddingTrainDataGenerateProcessor({
        data: {
          trainsetId,
          datasetIds: [datasetId1, datasetId2],
          generateConfig: { indexType: 'question' }
        },
        id: 'test-job-id',
        attemptsMade: 0,
        opts: { attempts: 1 }
      } as any);

      expect(sampleDataFromDataset).toHaveBeenCalled();
    });

    test('强制重新生成应该原子性替换旧数据（先生成后删+插）', async () => {
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
          collectionId: 'col_001'
        }
      ]);

      const { buildFineTuneDataStream } = await import(
        '@fastgpt/service/core/train/common/synthesize/buildFineTuneData'
      );
      async function* mockStream() {
        yield {
          query: 'Test query',
          positive: ['Test answer'],
          negatives: ['Random text'],
          sourceId: 'data_001',
          datasetId: datasetId1
        };
      }
      (buildFineTuneDataStream as any).mockReturnValue(mockStream());

      (MongoEmbeddingTrainsetData.insertMany as any).mockResolvedValue([{ _id: 'train_data_1' }]);
      (MongoEmbeddingTrainset.updateOne as any).mockResolvedValue({});

      await embeddingTrainDataGenerateProcessor({
        data: {
          trainsetId,
          datasetIds: [datasetId1],
          generateConfig: { indexType: 'question', forceRegenerate: true }
        },
        id: 'test-job-id',
        attemptsMade: 0,
        opts: { attempts: 1 }
      } as any);

      // deleteMany is called before streaming insert (no transaction)
      expect(MongoEmbeddingTrainsetData.deleteMany).toHaveBeenCalledWith({
        trainsetId,
        source: EmbeddingTrainDataSourceEnum.dataset
      });
      // insertMany is called after streaming
      expect(MongoEmbeddingTrainsetData.insertMany).toHaveBeenCalledWith(expect.any(Array));
    });
  });

  describe('createManualEmbeddingTrainData', () => {
    test('应该成功创建手动训练数据', async () => {
      (MongoEmbeddingTrainsetData.create as any).mockResolvedValue([
        createMockDoc({ _id: 'manual_data_1' })
      ]);

      const data = await createManualEmbeddingTrainData({
        trainsetId,
        teamId,
        tmbId,
        query: 'What is embedding?',
        positiveDocs: ['Doc 1'],
        negativeDocs: ['Doc 2', 'Doc 3'],
        reason: 'Test data'
      });

      expect(String(data._id)).toBe('manual_data_1');
      expect(MongoEmbeddingTrainsetData.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            trainsetId,
            query: 'What is embedding?',
            source: EmbeddingTrainDataSourceEnum.manual
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
            source: EmbeddingTrainDataSourceEnum.dataset,
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
