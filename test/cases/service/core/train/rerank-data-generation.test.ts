import { describe, test, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import {
  createManualTrainData,
  updateTrainData,
  calculateTrainsetStats
} from '@fastgpt/service/core/train/rerank/data/controller';
import { rerankTrainDataGenerateProcessor } from '@fastgpt/service/core/train/rerank/data/processor';
import {
  RerankTrainsetStatusEnum,
  TrainDataSourceEnum
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

vi.mock('@fastgpt/service/core/train/rerank/external', () => ({
  syntheticRerankTrainDatas: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/rerank/utils', async () => {
  const actual = await vi.importActual('@fastgpt/service/core/train/rerank/utils');
  return {
    ...actual,
    sampleDataFromDataset: vi.fn()
  };
});

describe('Rerank Train Data Generation', () => {
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
      MongoRerankTrainset.deleteMany({ teamId })
    ]);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('rerankTrainDataGenerateProcessor', () => {
    test('应该成功从 datasetIds 生成训练数据（不需要 appId）', async () => {
      // Mock trainset exists
      (MongoRerankTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId,
        status: RerankTrainsetStatusEnum.pending
      });

      // Mock data sampling
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
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
      const { syntheticRerankTrainDatas } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      (syntheticRerankTrainDatas as any).mockResolvedValue({
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

      (MongoRerankTrainsetData.insertMany as any).mockResolvedValue([{ _id: 'train_data_1' }]);
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      await rerankTrainDataGenerateProcessor({
        data: {
          trainsetId,
          datasetIds: [datasetId1, datasetId2]
        },
        id: 'test-job-id',
        attemptsMade: 0,
        opts: { attempts: 1 }
      } as any);

      // Verify sampling via datasetIds directly, no appId dependency
      expect(sampleDataFromDataset).toHaveBeenCalledWith(
        expect.arrayContaining([datasetId1, datasetId2]),
        expect.any(Object)
      );
      expect(syntheticRerankTrainDatas).toHaveBeenCalled();
    });

    test('训练集不存在时应抛出错误', async () => {
      (MongoRerankTrainset.findById as any).mockResolvedValue(null);

      await expect(
        rerankTrainDataGenerateProcessor({
          data: {
            trainsetId: 'non_existent_trainset',
            datasetIds: [datasetId1]
          },
          id: 'test-job-id',
          attemptsMade: 0,
          opts: { attempts: 1 }
        } as any)
      ).rejects.toThrow('trainsetGenNotFound');
    });

    test('datasetIds 为空时应抛出错误', async () => {
      (MongoRerankTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId,
        status: RerankTrainsetStatusEnum.pending
      });

      await expect(
        rerankTrainDataGenerateProcessor({
          data: {
            trainsetId,
            datasetIds: [] // Empty array
          },
          id: 'test-job-id',
          attemptsMade: 0,
          opts: { attempts: 1 }
        } as any)
      ).rejects.toThrow('trainsetGenNoDataset');
    });

    test('知识库没有数据时应抛出错误', async () => {
      (MongoRerankTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId,
        status: RerankTrainsetStatusEnum.pending
      });

      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      (sampleDataFromDataset as any).mockResolvedValue([]);

      (MongoDatasetData.aggregate as any).mockResolvedValue([]);

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
      ).rejects.toThrow('trainsetGenDatasetEmpty');
    });

    test('外部服务失败时应正确处理错误', async () => {
      (MongoRerankTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId,
        status: RerankTrainsetStatusEnum.pending
      });

      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      (sampleDataFromDataset as any).mockResolvedValue([
        { datasetId: datasetId1, dataId: 'data_001', q: 'What is AI?', a: 'AI', indexes: [] }
      ]);

      const { syntheticRerankTrainDatas } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      (syntheticRerankTrainDatas as any).mockResolvedValue({
        success: false,
        error: 'DiTing service error'
      });

      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

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
      ).rejects.toThrow('trainsetGenDitingNoData');
    });

    test('指定 sampleSize 时应该正确使用', async () => {
      (MongoRerankTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId,
        status: RerankTrainsetStatusEnum.pending
      });

      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      (sampleDataFromDataset as any).mockResolvedValue([
        { datasetId: datasetId1, dataId: 'data_001', q: 'What is AI?', a: 'AI', indexes: [] }
      ]);

      const { syntheticRerankTrainDatas } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      (syntheticRerankTrainDatas as any).mockResolvedValue({
        success: true,
        data: [
          {
            query: 'Test query',
            positive: ['Positive doc'],
            negatives: ['Negative doc 1'],
            sourceId: 'data_001',
            datasetId: datasetId1
          }
        ]
      });

      (MongoRerankTrainsetData.insertMany as any).mockResolvedValue([]);
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      await rerankTrainDataGenerateProcessor({
        data: {
          trainsetId,
          datasetIds: [datasetId1],
          generateConfig: { sampleSize: 50 }
        },
        id: 'test-job-id',
        attemptsMade: 0,
        opts: { attempts: 1 }
      } as any);

      // Verify specified sampleSize is used
      expect(sampleDataFromDataset).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({ sampleSize: 50 })
      );
    });
  });

  describe('createManualTrainData', () => {
    test('应该成功创建手动训练数据（不需要 appId）', async () => {
      vi.clearAllMocks();

      (MongoRerankTrainsetData.create as any).mockResolvedValue([{ _id: 'train_data_123' }]);

      const dataId = await createManualTrainData({
        trainsetId,
        teamId,
        tmbId,
        query: 'Test query',
        positiveDocs: ['Positive doc'],
        negativeDocs: ['Negative doc 1', 'Negative doc 2']
      });

      expect(dataId).toBe('train_data_123');
      expect(MongoRerankTrainsetData.create).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            trainsetId,
            teamId,
            query: 'Test query',
            positiveDocs: ['Positive doc'],
            negativeDocs: ['Negative doc 1', 'Negative doc 2'],
            source: TrainDataSourceEnum.manual,
            metadata: expect.objectContaining({
              sourceInfo: expect.objectContaining({
                manualInfo: expect.objectContaining({
                  creator: tmbId,
                  createdAt: expect.any(Date)
                })
              })
            })
          })
        ])
      );
    });
  });

  describe('calculateTrainsetStats', () => {
    test('应该正确计算训练集统计信息', async () => {
      const mockTrainData = [
        {
          query: 'query1',
          positiveDocs: ['positive1'],
          negativeDocs: ['negative1', 'negative2'],
          source: TrainDataSourceEnum.dataset,
          metadata: {
            sourceInfo: {
              datasetInfo: {
                dataId: 'data_1',
                datasetId: datasetId1
              }
            }
          }
        },
        {
          query: 'query2',
          positiveDocs: ['positive2'],
          negativeDocs: ['negative3'],
          source: TrainDataSourceEnum.dataset,
          metadata: {
            sourceInfo: {
              datasetInfo: {
                dataId: 'data_2',
                datasetId: datasetId2
              }
            }
          }
        }
      ];

      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTrainData)
      });

      const stats = await calculateTrainsetStats(trainsetId);

      expect(stats).toEqual({
        dataCount: 2,
        positiveCount: 2,
        negativeCount: 3,
        sourceSummary: expect.arrayContaining([
          expect.objectContaining({
            type: 'dataset',
            count: expect.any(Number)
          })
        ])
      });
    });

    test('空训练集应返回零统计', async () => {
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      });

      const stats = await calculateTrainsetStats(trainsetId);

      expect(stats.dataCount).toBe(0);
      expect(stats.positiveCount).toBe(0);
      expect(stats.negativeCount).toBe(0);
    });
  });
});
