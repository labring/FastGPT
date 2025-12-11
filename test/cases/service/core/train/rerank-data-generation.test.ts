import { describe, test, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  generateAppTrainsetDataCore,
  createManualTrainData,
  updateTrainData,
  deleteTrainData,
  calculateTrainsetStats
} from '@fastgpt/service/core/train/rerank/data/controller';
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
    create: vi.fn().mockResolvedValue({ _id: 'train_data_123' })
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

describe('Rerank Train Data Generation', () => {
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
      MongoRerankTrainset.deleteMany({ teamId })
    ]);
  });

  beforeEach(async () => {
    vi.clearAllMocks();
  });

  describe('generateAppTrainsetDataCore', () => {
    test('应该成功从应用关联的知识库生成训练数据', async () => {
      // Mock应用配置，包含知识库搜索节点
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

      // Mock训练集
      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: trainsetId,
          teamId: new Types.ObjectId(teamId),
          appId: new Types.ObjectId(appId)
        })
      });

      // Mock知识库数据
      const dataId1 = '507f1f77bcf86cd799439021';
      const dataId2 = '507f1f77bcf86cd799439022';
      const dataId3 = '507f1f77bcf86cd799439023';

      const mockDatasetData = [
        {
          _id: { toString: () => dataId1 },
          datasetId: { toString: () => datasetId1 },
          q: 'What is AI?',
          a: 'Artificial Intelligence',
          indexes: []
        },
        {
          _id: { toString: () => dataId2 },
          datasetId: { toString: () => datasetId1 },
          q: 'What is ML?',
          a: 'Machine Learning',
          indexes: []
        },
        {
          _id: { toString: () => dataId3 },
          datasetId: { toString: () => datasetId2 },
          q: 'What is Deep Learning?',
          a: 'Deep Learning is a subset of ML',
          indexes: []
        }
      ];

      (MongoDatasetData.aggregate as any).mockResolvedValue(mockDatasetData);

      // Mock外部服务
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
            sourceId: 'data_1',
            datasetId: datasetId1
          }
        ]
      });

      // Mock更新和插入操作
      (MongoRerankTrainsetData.insertMany as any).mockResolvedValue([{ _id: 'train_data_1' }]);
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      await generateAppTrainsetDataCore({
        appId,
        trainsetId
      });

      // 验证调用
      expect(MongoApp.findById).toHaveBeenCalledWith(appId);
      expect(syntheticRerankTrainDatas).toHaveBeenCalledWith({
        samples: expect.arrayContaining([
          expect.objectContaining({
            datasetId: expect.any(String),
            dataId: expect.any(String),
            q: expect.any(String),
            a: expect.any(String)
          })
        ]),
        config: {} // 没有传递 generateConfig 时为空对象，默认值由 DiTing 服务端处理
      });
    });

    test('应用不存在时应抛出错误', async () => {
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue(null)
      });

      await expect(
        generateAppTrainsetDataCore({
          appId: 'non_existent_app',
          trainsetId
        })
      ).rejects.toThrow('App not found');
    });

    test('训练集不存在时应抛出错误', async () => {
      // 先清除默认模拟，然后设置特定模拟
      vi.clearAllMocks();

      // Mock应用存在（避免先检查应用时抛出App not found）
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
                  value: [{ datasetId: datasetId1, name: 'Dataset 1' }]
                }
              ]
            }
          ]
        })
      });

      // Mock训练集不存在 - 直接mock返回值而不使用lean()
      (MongoRerankTrainset.findById as any).mockResolvedValue(null);

      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId: 'non_existent_trainset'
        })
      ).rejects.toThrow('Trainset not found');
    });

    test('应用没有关联知识库时应抛出错误', async () => {
      (MongoApp.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: appId,
          modules: []
        })
      });

      (MongoRerankTrainset.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: trainsetId,
          teamId: new Types.ObjectId(teamId)
        })
      });

      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId
        })
      ).rejects.toThrow('No datasets found for this app');
    });

    test('知识库没有数据时应抛出错误', async () => {
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
      (MongoDatasetData.aggregate as any).mockResolvedValue([]);

      await expect(
        generateAppTrainsetDataCore({
          appId,
          trainsetId
        })
      ).rejects.toThrow('No data available in dataset');
    });

    test('外部服务失败时应正确处理错误', async () => {
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

      (MongoDatasetData.aggregate as any).mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'What is AI?',
          a: 'Artificial Intelligence'
        }
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
        generateAppTrainsetDataCore({
          appId,
          trainsetId
        })
      ).rejects.toThrow('DiTing service error');

      // 验证训练集状态被设置为错误
      expect(MongoRerankTrainset.updateOne).toHaveBeenCalledWith(
        { _id: trainsetId },
        expect.objectContaining({
          status: RerankTrainsetStatusEnum.error,
          errorMsg: 'DiTing service error'
        })
      );
    });

    test('指定sampleSize时应该正确使用', async () => {
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

      (MongoDatasetData.aggregate as any).mockResolvedValue([
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'What is AI?',
          a: 'Artificial Intelligence'
        }
      ]);

      const { syntheticRerankTrainDatas } = await import(
        '@fastgpt/service/core/train/rerank/external'
      );
      (syntheticRerankTrainDatas as any).mockResolvedValue({
        success: true,
        data: []
      });

      (MongoRerankTrainsetData.insertMany as any).mockResolvedValue([]);
      (MongoRerankTrainset.updateOne as any).mockResolvedValue({});

      await generateAppTrainsetDataCore({
        appId,
        trainsetId,
        generateConfig: { sampleSize: 50 }
      });

      // 验证使用了指定的sampleSize
      expect(MongoDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ $match: expect.any(Object) }),
          expect.objectContaining({ $sample: { size: 50 } })
        ])
      );
    });
  });

  describe('createManualTrainData', () => {
    test('应该成功创建手动训练数据', async () => {
      // 先清除默认模拟，然后设置特定模拟
      vi.clearAllMocks();

      (MongoRerankTrainsetData.create as any).mockResolvedValue([{ _id: 'train_data_123' }]);

      const dataId = await createManualTrainData({
        trainsetId,
        appId,
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
            appId,
            teamId,
            query: 'Test query',
            positiveDocs: ['Positive doc'],
            negativeDocs: ['Negative doc 1', 'Negative doc 2'],
            source: TrainDataSourceEnum.manual,
            metadata: expect.objectContaining({
              sourceInfo: expect.objectContaining({
                manualInfo: expect.objectContaining({
                  creator: tmbId,
                  createdAt: expect.any(Date),
                  reason: undefined
                })
              })
            })
          })
        ])
      );
    });
  });

  describe('updateTrainData', () => {
    test('应该成功更新训练数据', async () => {
      (MongoRerankTrainsetData.updateOne as any).mockResolvedValue({});
      (MongoRerankTrainsetData.findById as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          _id: 'train_data_123',
          trainsetId
        })
      });

      await updateTrainData({
        dataId: 'train_data_123',
        query: 'Updated query',
        positiveDocs: ['Updated positive doc'],
        negativeDocs: ['Updated negative doc']
      });

      expect(MongoRerankTrainsetData.updateOne).toHaveBeenCalledWith(
        { _id: 'train_data_123' },
        {
          query: 'Updated query',
          positiveDocs: ['Updated positive doc'],
          negativeDocs: ['Updated negative doc']
        }
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
            count: 1,
            datasetInfo: expect.objectContaining({
              datasetId: datasetId1
            })
          }),
          expect.objectContaining({
            type: 'dataset',
            count: 1,
            datasetInfo: expect.objectContaining({
              datasetId: datasetId2
            })
          })
        ])
      });
    });

    test('空训练集应该返回零统计', async () => {
      (MongoRerankTrainsetData.find as any).mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      });

      const stats = await calculateTrainsetStats(trainsetId);

      expect(stats).toEqual({
        dataCount: 0,
        positiveCount: 0,
        negativeCount: 0,
        sourceSummary: []
      });
    });
  });
});
