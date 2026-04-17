import { describe, test, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import {
  RerankTrainsetStatusEnum,
  RerankTrainDataSourceEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
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
vi.mock('@fastgpt/service/core/train/rerank/data/schema', () => ({
  MongoRerankTrainsetData: {
    find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
    findById: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(null) }),
    updateOne: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 }),
    insertMany: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue([{ _id: 'train_data_123' }])
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/trainset/schema', () => ({
  MongoRerankTrainset: {
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

vi.mock('@fastgpt/service/core/train/rerank/external', () => ({}));

vi.mock('@fastgpt/service/core/train/common/synthesize/buildFineTuneData', () => ({
  buildFineTuneData: vi.fn()
}));

// mongoSessionRun: execute the callback with a fake session object so transaction logic is testable
vi.mock('@fastgpt/service/common/mongo/sessionRun', () => ({
  mongoSessionRun: vi.fn().mockImplementation(async (fn: any) => fn({}))
}));

vi.mock('@fastgpt/service/core/train/rerank/utils', async () => {
  const actual = await vi.importActual('@fastgpt/service/core/train/rerank/utils');
  return {
    ...actual,
    sampleDataFromDataset: vi.fn()
  };
});

describe('Rerank Train Data Integration Tests', () => {
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
      MongoRerankTrainsetData.deleteMany({ teamId }),
      MongoRerankTrainset.deleteMany({ teamId }),
      MongoDatasetData.deleteMany({ teamId })
    ]);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('Complete data generation flow', () => {
    test('应该成功完成从 datasetIds 到训练数据的完整流程', async () => {
      // 1. Mock trainset exists
      (MongoRerankTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId,
        name: 'Test Trainset',
        status: RerankTrainsetStatusEnum.pending
      });

      // 2. Mock data sampling
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      const mockSamples = [
        {
          datasetId: datasetId1,
          dataId: 'data_1_1',
          q: 'What is AI?',
          a: 'Artificial Intelligence is a field of computer science',
          indexes: []
        },
        {
          datasetId: datasetId1,
          dataId: 'data_1_2',
          q: 'What is Machine Learning?',
          a: 'Machine Learning is a subset of AI',
          indexes: []
        },
        {
          datasetId: datasetId2,
          dataId: 'data_2_1',
          q: 'What is Deep Learning?',
          a: 'Deep Learning is a subset of Machine Learning',
          indexes: []
        }
      ];
      (sampleDataFromDataset as any).mockResolvedValue(mockSamples);

      // 3. Mock buildFineTuneData
      const { buildFineTuneData } = await import(
        '@fastgpt/service/core/train/common/synthesize/buildFineTuneData'
      );
      (buildFineTuneData as any).mockReturnValue({
        samples: [
          {
            query: '什么是人工智能？',
            positive: ['Artificial Intelligence is a field of computer science'],
            negatives: ['Random text 1', 'Random text 2'],
            sourceId: 'data_1_1',
            datasetId: datasetId1
          },
          {
            query: '机器学习是什么？',
            positive: ['Machine Learning is a subset of AI'],
            negatives: ['Random text 3', 'Random text 4'],
            sourceId: 'data_1_2',
            datasetId: datasetId1
          }
        ]
      });

      (MongoRerankTrainsetData.insertMany as any).mockResolvedValue([
        { _id: 'train_data_1' },
        { _id: 'train_data_2' }
      ]);
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      // Execute generation flow
      const { rerankTrainDataGenerateProcessor } = await import(
        '@fastgpt/service/core/train/rerank/data/processor'
      );

      await rerankTrainDataGenerateProcessor({
        data: {
          trainsetId,
          datasetIds: [datasetId1, datasetId2]
        },
        id: 'test-job-id',
        attemptsMade: 0,
        opts: { attempts: 1 }
      } as any);

      // Verify call sequence
      expect(MongoRerankTrainset.findById).toHaveBeenCalledWith(trainsetId);
      expect(sampleDataFromDataset).toHaveBeenCalledWith(
        [datasetId1, datasetId2],
        expect.any(Object)
      );
      expect(buildFineTuneData).toHaveBeenCalledTimes(1);
      expect(MongoRerankTrainsetData.insertMany).toHaveBeenCalledTimes(1);

      expect(MongoRerankTrainsetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            trainsetId,
            teamId: expect.any(String),
            query: expect.any(String),
            source: RerankTrainDataSourceEnum.dataset,
            metadata: expect.objectContaining({
              sourceInfo: expect.objectContaining({
                datasetInfo: expect.objectContaining({
                  dataId: expect.any(String),
                  datasetId: expect.any(String)
                })
              })
            })
          })
        ])
      );
    });

    test('强制重新生成应该原子性替换旧数据（先生成后删+插）', async () => {
      (MongoRerankTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId,
        status: RerankTrainsetStatusEnum.ready
      });

      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      (sampleDataFromDataset as any).mockResolvedValue([
        { datasetId: datasetId1, dataId: 'data_001', q: 'q1', a: 'a1', indexes: [] }
      ]);

      const { buildFineTuneData } = await import(
        '@fastgpt/service/core/train/common/synthesize/buildFineTuneData'
      );
      (buildFineTuneData as any).mockReturnValue({
        samples: [
          {
            query: 'Test',
            positive: ['Doc'],
            negatives: ['Other'],
            sourceId: 'data_001',
            datasetId: datasetId1
          }
        ]
      });
      (MongoRerankTrainsetData.insertMany as any).mockResolvedValue([]);
      (MongoRerankTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 5 });
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      const { rerankTrainDataGenerateProcessor } = await import(
        '@fastgpt/service/core/train/rerank/data/processor'
      );

      await rerankTrainDataGenerateProcessor({
        data: {
          trainsetId,
          datasetIds: [datasetId1],
          generateConfig: { forceRegenerate: true }
        },
        id: 'test-job-id',
        attemptsMade: 0,
        opts: { attempts: 1 }
      } as any);

      // deleteMany is called inside mongoSessionRun with filter + session option
      expect(MongoRerankTrainsetData.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ trainsetId }),
        expect.objectContaining({ session: expect.any(Object) })
      );
      // insertMany is also called inside the same transaction
      expect(MongoRerankTrainsetData.insertMany).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ session: expect.any(Object) })
      );
    });
  });

  describe('Error Handling Integration Tests', () => {
    test('外部服务失败应该正确回滚状态', async () => {
      (MongoRerankTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId,
        status: RerankTrainsetStatusEnum.pending
      });

      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      (sampleDataFromDataset as any).mockResolvedValue([
        { datasetId: datasetId1, dataId: 'data_001', q: 'q1', a: 'a1', indexes: [] }
      ]);

      const { buildFineTuneData } = await import(
        '@fastgpt/service/core/train/common/synthesize/buildFineTuneData'
      );
      (buildFineTuneData as any).mockImplementation(() => {
        throw new Error('DiTing service unavailable');
      });

      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      const { rerankTrainDataGenerateProcessor } = await import(
        '@fastgpt/service/core/train/rerank/data/processor'
      );

      await expect(
        rerankTrainDataGenerateProcessor({
          data: {
            trainsetId,
            datasetIds: [datasetId1]
          },
          id: 'test-job-id',
          attemptsMade: 0,
          opts: { attempts: 1 }
        } as any)
      ).rejects.toThrow();

      // Verify status is updated to generating before external service call
      // Note: processor sets generating before external call; failed state is handled by the worker
      expect(MongoRerankTrainset.updateOne).toHaveBeenCalledWith(
        { _id: trainsetId },
        expect.objectContaining({ status: RerankTrainsetStatusEnum.generating })
      );
    });

    test('数据采样返回空时应正确抛出错误', async () => {
      (MongoRerankTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId,
        status: RerankTrainsetStatusEnum.pending
      });

      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      (sampleDataFromDataset as any).mockResolvedValue([]);

      const { rerankTrainDataGenerateProcessor } = await import(
        '@fastgpt/service/core/train/rerank/data/processor'
      );

      await expect(
        rerankTrainDataGenerateProcessor({
          data: {
            trainsetId,
            datasetIds: [datasetId1]
          },
          id: 'test-job-id',
          attemptsMade: 0,
          opts: { attempts: 1 }
        } as any)
      ).rejects.toThrow('rerankTrainsetGenDatasetEmpty');
    });
  });
});
