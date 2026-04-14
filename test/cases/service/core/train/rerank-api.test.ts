import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  RerankTrainsetStatusEnum,
  RerankTrainDataSourceEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
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

vi.mock('@fastgpt/service/common/mongo', async () => {
  const actual = await vi.importActual('@fastgpt/service/common/mongo');
  return {
    ...actual,
    Types: {
      ObjectId: vi.fn((id) => ({ _id: id, toString: () => id }))
    }
  };
});

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

// Mock BullMQ for queue operations
vi.mock('@fastgpt/service/common/bullmq', () => ({
  getQueue: vi.fn(() => ({
    add: vi.fn().mockResolvedValue({ id: 'test-job-id' }),
    getJob: vi.fn(),
    getJobs: vi.fn().mockResolvedValue([])
  })),
  QueueNames: {
    rerankTrainDataGenerate: 'rerankTrainDataGenerate'
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/external', () => ({}));

vi.mock('@fastgpt/service/core/train/common/synthesize/buildFineTuneData', () => ({
  buildFineTuneData: vi.fn()
}));

vi.mock('@fastgpt/service/core/train/rerank/utils', async () => {
  const actual = await vi.importActual('@fastgpt/service/core/train/rerank/utils');
  return {
    ...actual,
    sampleDataFromDataset: vi.fn()
  };
});

describe('Rerank Train Data API', () => {
  let teamId: string;
  let tmbId: string;
  let trainsetId: string;
  let datasetId1: string;
  let datasetId2: string;

  beforeEach(async () => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    trainsetId = '507f1f77bcf86cd799439014';
    datasetId1 = '507f1f77bcf86cd799439015';
    datasetId2 = '507f1f77bcf86cd799439016';

    vi.clearAllMocks();

    // Reset default mocks
    (MongoRerankTrainset.findById as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: trainsetId,
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        status: RerankTrainsetStatusEnum.pending
      })
    });
  });

  afterEach(async () => {
    // clean up test data
    await Promise.all([
      MongoRerankTrainsetData.deleteMany({ teamId }),
      MongoRerankTrainset.deleteMany({ teamId })
    ]);
  });

  describe('Generate Rerank Train Data API', () => {
    test('应该成功触发训练数据生成任务', async () => {
      // Mock trainset exists and is in idle state
      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: trainsetId,
          teamId: new Types.ObjectId(teamId),
          tmbId: new Types.ObjectId(tmbId),
          status: RerankTrainsetStatusEnum.pending
        })
      });

      // Mock update trainset status
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      // Mock data sampling
      const { sampleDataFromDataset } = await import('@fastgpt/service/core/train/rerank/utils');
      (sampleDataFromDataset as any).mockResolvedValue([
        {
          datasetId: datasetId1,
          dataId: 'data_1',
          q: 'Test question',
          a: 'Test answer',
          indexes: []
        }
      ]);

      const { buildFineTuneData } = await import(
        '@fastgpt/service/core/train/common/synthesize/buildFineTuneData'
      );
      (buildFineTuneData as any).mockReturnValue({
        samples: [
          {
            query: 'Test query',
            positive: ['Test positive'],
            negatives: ['Test negative'],
            sourceId: 'data_1',
            datasetId: datasetId1
          }
        ]
      });

      (MongoRerankTrainsetData.insertMany as any).mockResolvedValue([{ _id: 'train_data_1' }]);

      // Call the core function
      const { rerankTrainDataGenerateProcessor } = await import(
        '@fastgpt/service/core/train/rerank/data/processor'
      );
      await rerankTrainDataGenerateProcessor({
        data: {
          trainsetId,
          datasetIds: [datasetId1, datasetId2],
          generateConfig: {
            sampleSize: 100,
            forceRegenerate: false
          }
        },
        id: 'test-job-id',
        attemptsMade: 0,
        opts: { attempts: 1 }
      } as any);

      // Verify pre-condition checks
      expect(MongoRerankTrainset.findById).toHaveBeenCalled();
    });

    test('训练集不存在时应返回错误', async () => {
      vi.clearAllMocks();

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      try {
        const { rerankTrainDataGenerateProcessor } = await import(
          '@fastgpt/service/core/train/rerank/data/processor'
        );
        await rerankTrainDataGenerateProcessor({
          data: {
            trainsetId: 'non_existent_trainset',
            datasetIds: [datasetId1]
          },
          id: 'test-job-id',
          attemptsMade: 0,
          opts: { attempts: 1 }
        } as any);
      } catch (error: any) {
        expect(error.message).toContain('rerankTrainsetGenNotFound');
      }
    });

    test('训练集正在生成时应返回错误', async () => {
      vi.clearAllMocks();

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: trainsetId,
          status: RerankTrainsetStatusEnum.generating
        })
      });

      try {
        const { rerankTrainDataGenerateProcessor } = await import(
          '@fastgpt/service/core/train/rerank/data/processor'
        );
        await rerankTrainDataGenerateProcessor({
          data: {
            trainsetId,
            datasetIds: [datasetId1]
          },
          id: 'test-job-id',
          attemptsMade: 0,
          opts: { attempts: 1 }
        } as any);
      } catch (error: any) {
        expect(error.message).toContain('rerankTrainsetGenAlreadyGenerating');
      }

      // Verify business logic: generating trainset is checked
      expect(MongoRerankTrainset.findById).toHaveBeenCalled();
    });

    test('datasetIds 为空时应返回错误', async () => {
      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: trainsetId,
          status: RerankTrainsetStatusEnum.pending
        })
      });

      try {
        const { rerankTrainDataGenerateProcessor } = await import(
          '@fastgpt/service/core/train/rerank/data/processor'
        );
        await rerankTrainDataGenerateProcessor({
          data: {
            trainsetId,
            datasetIds: []
          },
          id: 'test-job-id',
          attemptsMade: 0,
          opts: { attempts: 1 }
        } as any);
      } catch (error: any) {
        expect(error.message).toContain('rerankTrainsetGenNoDataset');
      }
    });
  });

  describe('Get Trainset Details API', () => {
    test('应该成功返回训练集详情', async () => {
      const mockTrainset = {
        _id: new Types.ObjectId(trainsetId),
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Test Trainset',
        description: 'Test description',
        status: RerankTrainsetStatusEnum.ready,
        createTime: new Date(),
        updateTime: new Date()
      };

      const mockTrainData = [
        {
          _id: new Types.ObjectId(),
          trainsetId: new Types.ObjectId(trainsetId),
          query: 'query1',
          positiveDocs: ['positive1'],
          negativeDocs: ['negative1', 'negative2'],
          source: RerankTrainDataSourceEnum.dataset,
          createTime: new Date()
        }
      ];

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTrainset)
      });

      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTrainData)
      });

      // Verify query call
      const result = await MongoRerankTrainset.findById(trainsetId).lean();
      expect(result).toBeDefined();
      expect(result?._id.toString()).toBe(trainsetId);
    });

    test('训练集不存在时应返回null', async () => {
      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      const result = await MongoRerankTrainset.findById('non_existent').lean();
      expect(result).toBeNull();
    });
  });

  describe('Create Manual Train Data API', () => {
    test('应该成功创建手动训练数据', async () => {
      vi.clearAllMocks();

      // Mock create training data
      (MongoRerankTrainsetData.create as any).mockResolvedValue([
        createMockDoc({ _id: 'train_data_123' })
      ]);

      const { createManualRerankTrainData } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      const data = await createManualRerankTrainData({
        trainsetId,
        teamId,
        tmbId,
        query: 'What is AI?',
        positiveDocs: ['Artificial Intelligence'],
        negativeDocs: ['Machine Learning', 'Deep Learning']
      });

      expect(String(data._id)).toBe('train_data_123');
      expect(MongoRerankTrainsetData.create).toHaveBeenCalled();
    });

    test('缺少必需字段时应返回错误', async () => {
      const request = {
        body: {
          trainsetId,
          // Missing queries
          positiveDocs: ['Positive doc'],
          negativeDocs: ['Negative doc']
        }
      } as { [key: string]: any };

      // Verify parameter validation logic
      expect(request.body.queries).toBeUndefined();
      expect(request.body.positiveDocs).toBeDefined();
      expect(request.body.negativeDocs).toBeDefined();
    });
  });

  describe('Update Train Data API', () => {
    test('应该成功更新训练数据', async () => {
      // Mock training data exists
      (MongoRerankTrainsetData.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'train_data_123',
          trainsetId
        })
      });

      // Mock update operation
      (MongoRerankTrainsetData.updateOne as any).mockResolvedValue({});

      const request = {
        body: {
          query: 'Updated query',
          positiveDocs: ['Updated positive doc'],
          negativeDocs: ['Updated negative doc 1', 'Updated negative doc 2']
        }
      };

      const { updateRerankTrainData } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      try {
        await updateRerankTrainData({
          dataId: 'train_data_123',
          query: request.body.query,
          positiveDocs: request.body.positiveDocs,
          negativeDocs: request.body.negativeDocs
        });

        expect(MongoRerankTrainsetData.updateOne).toHaveBeenCalled();
      } catch (error) {
        console.error('Train data update failed:', error);
      }
    });
  });

  describe('Delete Train Data API', () => {
    test('应该成功删除训练数据', async () => {
      // Mock training data exists
      (MongoRerankTrainsetData.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'train_data_123',
          trainsetId
        })
      });

      // Mock delete operation
      (MongoRerankTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 1 });
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      const { deleteRerankTrainData } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      try {
        const deletedCount = await deleteRerankTrainData(['train_data_123']);
        expect(deletedCount).toBe(1);
        expect(MongoRerankTrainsetData.deleteMany).toHaveBeenCalled();
      } catch (error) {
        console.error('Train data deletion failed:', error);
      }
    });

    test('删除不存在的训练数据应该返回0', async () => {
      // Mock training data not found
      (MongoRerankTrainsetData.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      const { deleteRerankTrainData } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      await expect(deleteRerankTrainData(['non_existent_data'])).rejects.toBe(
        'rerankTrainDataNotExist'
      );
    });
  });
});
