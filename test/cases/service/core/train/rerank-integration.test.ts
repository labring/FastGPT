import { describe, test, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
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
    aggregate: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 })
  }
}));

vi.mock('@fastgpt/service/core/train/rerank/external', () => ({
  syntheticRerankTrainDatas: vi.fn()
}));

// Mock BullMQ
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

describe('Rerank Train Data Integration Tests', () => {
  let teamId: string;
  let tmbId: string;
  let appId: string;
  let trainsetId: string;
  let datasetId1: string;
  let datasetId2: string;

  beforeAll(async () => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439012';
    appId = '507f1f77bcf86cd799439013';
    trainsetId = '507f1f77bcf86cd799439014';
    datasetId1 = '507f1f77bcf86cd799439015';
    datasetId2 = '507f1f77bcf86cd799439016';
  });

  afterAll(async () => {
    // 清理测试数据
    await Promise.all([
      MongoRerankTrainsetData.deleteMany({ teamId }),
      MongoRerankTrainset.deleteMany({ teamId }),
      MongoDatasetData.deleteMany({ teamId })
    ]);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('完整的数据生成流程', () => {
    test('应该成功完成从应用到训练数据的完整流程', async () => {
      // 1. Mock应用配置
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

      // 2. Mock训练集 - 直接mock返回值，不使用lean()
      (MongoRerankTrainset.findById as any).mockResolvedValue({
        _id: trainsetId,
        teamId: new Types.ObjectId(teamId),
        appId: new Types.ObjectId(appId),
        name: 'Test Trainset',
        status: RerankTrainsetStatusEnum.pending
      });

      // 3. Mock知识库数据
      const mockDatasetData1 = [
        {
          _id: new Types.ObjectId('data_1_1'),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'What is AI?',
          a: 'Artificial Intelligence is a field of computer science',
          indexes: [{ text: 'AI', dataId: 'data_1_1' }]
        },
        {
          _id: new Types.ObjectId('data_1_2'),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'What is Machine Learning?',
          a: 'Machine Learning is a subset of AI',
          indexes: [{ text: 'ML', dataId: 'data_1_2' }]
        }
      ];

      const mockDatasetData2 = [
        {
          _id: new Types.ObjectId('data_2_1'),
          datasetId: new Types.ObjectId(datasetId2),
          q: 'What is Deep Learning?',
          a: 'Deep Learning is a subset of Machine Learning',
          indexes: [{ text: 'DL', dataId: 'data_2_1' }]
        }
      ];

      // Mock countDocuments和aggregate
      (MongoDatasetData.countDocuments as any)
        .mockResolvedValueOnce(2) // dataset1有2条数据
        .mockResolvedValueOnce(1); // dataset2有1条数据

      (MongoDatasetData.aggregate as any)
        .mockResolvedValueOnce(mockDatasetData1)
        .mockResolvedValueOnce(mockDatasetData2);

      // 4. Mock外部服务
      const { syntheticRerankTrainDatas } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      (syntheticRerankTrainDatas as any).mockResolvedValue({
        success: true,
        data: [
          {
            query: '什么是人工智能？',
            positive: ['Artificial Intelligence is a field of computer science'],
            negatives: ['Random text 1', 'Random text 2', 'Random text 3'],
            sourceId: 'data_1_1',
            datasetId: datasetId1
          },
          {
            query: '机器学习是什么？',
            positive: ['Machine Learning is a subset of AI'],
            negatives: ['Random text 4', 'Random text 5'],
            sourceId: 'data_1_2',
            datasetId: datasetId1
          },
          {
            query: '深度学习是什么？',
            positive: ['Deep Learning is a subset of Machine Learning'],
            negatives: ['Random text 6'],
            sourceId: 'data_2_1',
            datasetId: datasetId2
          }
        ]
      });

      // 5. Mock数据库操作
      (MongoRerankTrainsetData.insertMany as any).mockResolvedValue([
        { _id: 'train_data_1' },
        { _id: 'train_data_2' },
        { _id: 'train_data_3' }
      ]);

      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      // 执行生成流程
      const { generateAppTrainsetDataCore } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      await generateAppTrainsetDataCore({
        appId,
        trainsetId
      });

      // 验证调用序列
      expect(MongoApp.findById).toHaveBeenCalledWith(appId);
      expect(MongoRerankTrainset.findById).toHaveBeenCalledWith(trainsetId);
      expect(MongoDatasetData.countDocuments).toHaveBeenCalledTimes(2);
      expect(MongoDatasetData.aggregate).toHaveBeenCalledTimes(2);
      expect(syntheticRerankTrainDatas).toHaveBeenCalledTimes(1);
      expect(MongoRerankTrainsetData.insertMany).toHaveBeenCalledTimes(1);
      expect(MongoRerankTrainset.updateOne).toHaveBeenCalledTimes(2); // 状态更新 + 统计更新

      // 验证外部服务调用参数
      expect(syntheticRerankTrainDatas).toHaveBeenCalledWith({
        samples: expect.arrayContaining([
          expect.objectContaining({
            datasetId: datasetId1,
            dataId: 'data_1_1',
            q: 'What is AI?',
            a: 'Artificial Intelligence is a field of computer science'
          }),
          expect.objectContaining({
            datasetId: datasetId1,
            dataId: 'data_1_2',
            q: 'What is Machine Learning?',
            a: 'Machine Learning is a subset of AI'
          }),
          expect.objectContaining({
            datasetId: datasetId2,
            dataId: 'data_2_1',
            q: 'What is Deep Learning?',
            a: 'Deep Learning is a subset of Machine Learning'
          })
        ]),
        config: {} // 默认值由 DiTing 服务端处理
      });

      // 验证数据插入格式
      expect(MongoRerankTrainsetData.insertMany).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            trainsetId,
            appId,
            query: expect.any(String), // 单个 query
            source: TrainDataSourceEnum.dataset,
            metadata: expect.objectContaining({
              sourceInfo: expect.objectContaining({
                datasetInfo: expect.objectContaining({
                  dataId: expect.any(String), // 单个 dataId
                  datasetId: expect.any(String) // 单个 datasetId
                })
              })
            })
          })
        ])
      );
    });

    test('强制重新生成应该先清空旧数据', async () => {
      // Mock基本配置
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: appId,
          modules: [
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                {
                  key: 'datasets',
                  value: [{ datasetId: datasetId1, name: 'Dataset 1' }]
                }
              ]
            }
          ]
        })
      });

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: trainsetId,
          teamId: new Types.ObjectId(teamId),
          appId: new Types.ObjectId(appId)
        })
      });

      (MongoDatasetData.countDocuments as any).mockResolvedValue(1);
      (MongoDatasetData.aggregate as any).mockResolvedValue([
        {
          _id: new Types.ObjectId('data_1'),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Test question',
          a: 'Test answer',
          indexes: []
        }
      ]);

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

      (MongoRerankTrainsetData.deleteMany as any).mockResolvedValue({ deletedCount: 5 });
      (MongoRerankTrainsetData.insertMany as any).mockResolvedValue([{ _id: 'new_data' }]);
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      // 执行强制重新生成
      const { generateAppTrainsetDataCore } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      await generateAppTrainsetDataCore({
        appId,
        trainsetId,
        generateConfig: { forceRegenerate: true }
      });

      // 验证先删除旧数据
      expect(MongoRerankTrainsetData.deleteMany).toHaveBeenCalledWith({
        trainsetId,
        source: TrainDataSourceEnum.dataset
      });

      // 验证状态更新为generating
      expect(MongoRerankTrainset.updateOne).toHaveBeenCalledWith(
        { _id: trainsetId },
        { status: RerankTrainsetStatusEnum.generating }
      );
    });

    test('统计信息应该正确更新', async () => {
      // 创建训练数据用于统计测试
      const mockTrainData = [
        {
          _id: new Types.ObjectId(),
          trainsetId: new Types.ObjectId(trainsetId),
          query: 'query1',
          positiveDocs: ['positive1'],
          negativeDocs: ['negative1', 'negative2'],
          source: TrainDataSourceEnum.dataset,
          metadata: {
            sourceInfo: {
              datasetInfo: {
                dataId: 'data_1_1',
                datasetId: datasetId1
              }
            }
          }
        },
        {
          _id: new Types.ObjectId(),
          trainsetId: new Types.ObjectId(trainsetId),
          query: 'query2',
          positiveDocs: ['positive2'],
          negativeDocs: ['negative3'],
          source: TrainDataSourceEnum.dataset,
          metadata: {
            sourceInfo: {
              datasetInfo: {
                dataId: 'data_2_1',
                datasetId: datasetId2
              }
            }
          }
        }
      ];

      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockTrainData)
      });

      const { calculateTrainsetStats } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      const stats = await calculateTrainsetStats(trainsetId);

      expect(stats).toEqual({
        dataCount: 2,
        positiveCount: 2,
        negativeCount: 3,
        sourceSummary: expect.arrayContaining([
          expect.objectContaining({
            type: 'dataset',
            count: 1, // 只有第一个训练数据来自 datasetId1
            datasetInfo: expect.objectContaining({
              datasetId: datasetId1
            })
          }),
          expect.objectContaining({
            type: 'dataset',
            count: 1, // 只有第二个训练数据来自 datasetId2
            datasetInfo: expect.objectContaining({
              datasetId: datasetId2
            })
          })
        ])
      });
    });
  });

  describe('错误处理集成测试', () => {
    test('外部服务失败应该正确回滚状态', async () => {
      // Mock基本配置
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: appId,
          modules: [
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                {
                  key: 'datasets',
                  value: [{ datasetId: datasetId1, name: 'Dataset 1' }]
                }
              ]
            }
          ]
        })
      });

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: trainsetId,
          teamId: new Types.ObjectId(teamId),
          appId: new Types.ObjectId(appId)
        })
      });

      (MongoDatasetData.countDocuments as any).mockResolvedValue(1);
      (MongoDatasetData.aggregate as any).mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Test',
          a: 'Test',
          indexes: []
        }
      ]);

      // Mock外部服务失败
      const { syntheticRerankTrainDatas } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      (syntheticRerankTrainDatas as any).mockResolvedValue({
        success: false,
        error: 'DiTing service temporarily unavailable'
      });

      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      const { generateAppTrainsetDataCore } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId
        })
      ).rejects.toThrow('DiTing service temporarily unavailable');

      // 验证错误状态设置
      expect(MongoRerankTrainset.updateOne).toHaveBeenCalledWith(
        { _id: trainsetId },
        expect.objectContaining({
          status: RerankTrainsetStatusEnum.error,
          errorMsg: 'DiTing service temporarily unavailable'
        })
      );
    });

    test('数据采样失败应该正确处理', async () => {
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: appId,
          modules: [
            {
              flowNodeType: 'datasetSearchNode',
              inputs: [
                {
                  key: 'datasets',
                  value: [{ datasetId: datasetId1, name: 'Dataset 1' }]
                }
              ]
            }
          ]
        })
      });

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: trainsetId,
          teamId: new Types.ObjectId(teamId)
        })
      });

      // Mock空数据
      (MongoDatasetData.countDocuments as any).mockResolvedValue(0);

      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      const { generateAppTrainsetDataCore } = await import(
        '@fastgpt/service/core/train/rerank/data/controller'
      );

      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId
        })
      ).rejects.toThrow('No data available in dataset');
    });
  });
});
