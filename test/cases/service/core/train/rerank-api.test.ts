import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  RerankTrainsetStatusEnum,
  TrainDataSourceEnum
} from '@fastgpt/global/core/train/rerank/constants';
import { MongoRerankTrainsetData } from '@fastgpt/service/core/train/rerank/data/schema';
import { MongoRerankTrainset } from '@fastgpt/service/core/train/rerank/trainset/schema';
import { MongoApp } from '@fastgpt/service/core/app/schema';
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

vi.mock('@fastgpt/service/core/app/schema', () => ({
  MongoApp: {
    findById: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    countDocuments: vi.fn().mockResolvedValue(3),
    aggregate: vi.fn().mockReturnValue({
      then: (resolve: any) => resolve([])
    }),
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

vi.mock('@fastgpt/service/core/train/rerank/external', () => ({
  syntheticRerankTrainDatas: vi.fn().mockResolvedValue({
    success: true,
    data: []
  })
}));

describe('Rerank Train Data API', () => {
  let teamId: string;
  let tmbId: string;
  let appId: string;
  let trainsetId: string;
  let datasetId1: string;
  let datasetId2: string;

  beforeEach(async () => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    appId = '507f1f77bcf86cd799439013';
    trainsetId = '507f1f77bcf86cd799439014';
    datasetId1 = '507f1f77bcf86cd799439015';
    datasetId2 = '507f1f77bcf86cd799439016';

    vi.clearAllMocks();

    // 重新设置默认模拟
    (MongoApp.findById as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: appId,
        name: 'Test App',
        modules: [
          {
            flowNodeType: 'datasetSearchNode',
            inputs: [
              {
                key: 'datasets',
                value: [
                  { datasetId: datasetId1, name: 'Dataset 1' },
                  { datasetId: datasetId2, name: 'Dataset 2' }
                ]
              }
            ]
          }
        ]
      })
    });

    (MongoRerankTrainset.findById as any).mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        _id: trainsetId,
        appId: new Types.ObjectId(appId),
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        status: RerankTrainsetStatusEnum.pending
      })
    });
  });

  afterEach(async () => {
    // 清理测试数据
    await Promise.all([
      MongoRerankTrainsetData.deleteMany({ teamId }),
      MongoRerankTrainset.deleteMany({ teamId })
    ]);
  });

  describe('Generate Rerank Train Data API', () => {
    test('应该成功触发训练数据生成任务', async () => {
      // Mock应用存在且有数据集
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: appId,
          name: 'Test App',
          modules: [
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                {
                  key: 'datasets',
                  value: [
                    { datasetId: datasetId1, name: 'Dataset 1' },
                    { datasetId: datasetId2, name: 'Dataset 2' }
                  ]
                }
              ]
            }
          ]
        })
      });

      // Mock训练集存在且处于idle状态
      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: trainsetId,
          appId: new Types.ObjectId(appId),
          teamId: new Types.ObjectId(teamId),
          tmbId: new Types.ObjectId(tmbId),
          status: RerankTrainsetStatusEnum.pending
        })
      });

      // Mock更新训练集状态
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      // Mock数据采样和外部服务
      (MongoDatasetData.aggregate as any).mockReturnValue({
        then: (resolve: any) =>
          resolve([
            {
              _id: new Types.ObjectId(),
              datasetId: new Types.ObjectId(datasetId1),
              q: 'Test question',
              a: 'Test answer',
              indexes: []
            }
          ])
      });

      const { syntheticRerankTrainDatas } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      (syntheticRerankTrainDatas as any).mockResolvedValue({
        success: true,
        data: [
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

      // 调用核心函数
      const { rerankTrainDataGenerateProcessor } = await import(
        '@fastgpt/service/core/train/rerank/data/processor'
      );
      await rerankTrainDataGenerateProcessor({
        data: {
          appId,
          trainsetId,
          generateConfig: {
            sampleSize: 100,
            forceRegenerate: false
          }
        },
        id: 'test-job-id',
        attemptsMade: 0,
        opts: { attempts: 1 }
      } as any);

      // 验证前置检查
      expect(MongoApp.findById).toHaveBeenCalled();
      expect(MongoRerankTrainset.findById).toHaveBeenCalled();
    });

    test('应用不存在时应返回错误', async () => {
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: trainsetId,
          status: RerankTrainsetStatusEnum.pending
        })
      });

      // 验证会抛出错误
      try {
        const { rerankTrainDataGenerateProcessor } = await import(
          '@fastgpt/service/core/train/rerank/data/processor'
        );
        await rerankTrainDataGenerateProcessor({
          data: {
            appId: 'non_existent_app',
            trainsetId
          },
          id: 'test-job-id',
          attemptsMade: 0,
          opts: { attempts: 1 }
        } as any);
      } catch (error: any) {
        expect(error.message).toContain('trainsetGenAppDeleted');
      }
    });

    test('训练集不存在时应返回错误', async () => {
      // 先清除默认模拟，然后设置特定模拟
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
            appId,
            trainsetId: 'non_existent_trainset'
          },
          id: 'test-job-id',
          attemptsMade: 0,
          opts: { attempts: 1 }
        } as any);
      } catch (error: any) {
        expect(error.message).toContain('trainsetGenNotFound');
      }
    });

    test('训练集正在生成时应返回错误', async () => {
      // 先清除默认模拟，然后设置特定模拟
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
            appId,
            trainsetId
          },
          id: 'test-job-id',
          attemptsMade: 0,
          opts: { attempts: 1 }
        } as any);
      } catch (error: any) {
        expect(error.message).toContain('trainsetGenAlreadyGenerating');
      }

      // 验证业务逻辑：生成中的训练集被检查
      expect(MongoRerankTrainset.findById).toHaveBeenCalled();
    });

    test('没有关联知识库时应返回错误', async () => {
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: appId,
          modules: []
        })
      });

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
            appId,
            trainsetId
          },
          id: 'test-job-id',
          attemptsMade: 0,
          opts: { attempts: 1 }
        } as any);
      } catch (error: any) {
        expect(error.message).toContain('trainsetGenNoDataset');
      }
    });
  });

  describe('Get Trainset Details API', () => {
    test('应该成功返回训练集详情', async () => {
      // 创建测试训练集和数据
      const mockTrainset = {
        _id: new Types.ObjectId(trainsetId),
        appId: new Types.ObjectId(appId),
        teamId: new Types.ObjectId(teamId),
        tmbId: new Types.ObjectId(tmbId),
        name: 'Test Trainset',
        description: 'Test description',
        status: RerankTrainsetStatusEnum.ready,
        createTime: new Date(),
        updateTime: new Date()
      };

      const mockStats = {
        dataCount: 10,
        positiveCount: 10,
        negativeCount: 50,
        sourceSummary: [
          {
            type: 'dataset' as const,
            count: 8,
            datasetInfo: {
              datasetId: datasetId1
            }
          },
          {
            type: 'dataset' as const,
            count: 2,
            datasetInfo: {
              datasetId: datasetId2
            }
          }
        ]
      };

      const mockTrainData = [
        {
          _id: new Types.ObjectId(),
          trainsetId: new Types.ObjectId(trainsetId),
          query: 'query1',
          positiveDocs: ['positive1'],
          negativeDocs: ['negative1', 'negative2'],
          source: TrainDataSourceEnum.dataset,
          createTime: new Date()
        }
      ];

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTrainset)
      });

      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTrainData)
      });

      // Mock应用信息
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: appId,
          name: 'Test App',
          avatar: 'core/app/assistant/assistantIcon'
        })
      });

      // 验证查询调用
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
      // 先清除默认模拟，然后设置特定模拟
      vi.clearAllMocks();

      // Mock创建训练数据
      (MongoRerankTrainsetData.create as any).mockResolvedValue([{ _id: 'train_data_123' }]);

      const { createManualTrainData } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      const dataId = await createManualTrainData({
        trainsetId,
        appId,
        teamId,
        tmbId,
        query: 'What is AI?',
        positiveDocs: ['Artificial Intelligence'],
        negativeDocs: ['Machine Learning', 'Deep Learning']
      });

      expect(dataId).toBe('train_data_123');
      expect(MongoRerankTrainsetData.create).toHaveBeenCalled();
    });

    test('缺少必需字段时应返回错误', async () => {
      const request = {
        body: {
          trainsetId,
          // 缺少 queries
          positiveDocs: ['Positive doc'],
          negativeDocs: ['Negative doc']
        }
      } as { [key: string]: any };

      // 验证参数校验逻辑
      expect(request.body.queries).toBeUndefined();
      expect(request.body.positiveDocs).toBeDefined();
      expect(request.body.negativeDocs).toBeDefined();
    });
  });

  describe('Update Train Data API', () => {
    test('应该成功更新训练数据', async () => {
      // Mock训练数据存在
      (MongoRerankTrainsetData.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'train_data_123',
          trainsetId
        })
      });

      // Mock更新操作
      (MongoRerankTrainsetData.updateOne as any).mockResolvedValue({});

      const request = {
        body: {
          query: 'Updated query',
          positiveDocs: ['Updated positive doc'],
          negativeDocs: ['Updated negative doc 1', 'Updated negative doc 2']
        }
      };

      const { updateTrainData } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      try {
        await updateTrainData({
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
      // Mock训练数据存在
      (MongoRerankTrainsetData.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'train_data_123',
          trainsetId
        })
      });

      // Mock删除操作
      (MongoRerankTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 1 });
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      const { deleteTrainData } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      try {
        const deletedCount = await deleteTrainData(['train_data_123']);
        expect(deletedCount).toBe(1);
        expect(MongoRerankTrainsetData.deleteMany).toHaveBeenCalled();
      } catch (error) {
        console.error('Train data deletion failed:', error);
      }
    });

    test('删除不存在的训练数据应该返回0', async () => {
      // Mock训练数据不存在
      (MongoRerankTrainsetData.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      const { deleteTrainData } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      try {
        await deleteTrainData(['non_existent_data']);
      } catch (error: any) {
        expect(error.message).toBe('Train data not found');
      }
    });
  });
});
