import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  sampleDataFromDataset,
  extractDatasetIdsFromApp
} from '@fastgpt/service/core/train/rerank/utils';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

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
  let counter = 0;
  return {
    ...actual,
    Types: {
      ObjectId: vi.fn((id) => {
        const objectId = id || `mock_id_${++counter}`;
        return { _id: objectId, toString: () => objectId };
      })
    }
  };
});

// Mock MongoDB DatasetData model
vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  MongoDatasetData: {
    countDocuments: vi.fn().mockResolvedValue(3),
    aggregate: vi.fn().mockResolvedValue([]),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 0 })
  }
}));

describe('Rerank Data Sampling', () => {
  let teamId: string;
  let tmbId: string;
  let datasetId1: string;
  let datasetId2: string;

  beforeEach(async () => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439014';
    datasetId1 = '507f1f77bcf86cd799439012';
    datasetId2 = '507f1f77bcf86cd799439013';

    vi.clearAllMocks();
  });

  afterEach(async () => {
    // 清理测试数据
    await MongoDatasetData.deleteMany({ teamId });
  });

  describe('extractDatasetIdsFromApp', () => {
    test('应该正确从应用配置中提取数据集ID', () => {
      const app = {
        _id: 'app_123',
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app description',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'node_1',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            name: 'Dataset Search Node',
            inputs: [
              {
                key: 'datasets',
                value: [
                  { datasetId: datasetId1, name: 'Dataset 1' },
                  { datasetId: datasetId2, name: 'Dataset 2' },
                  { datasetId: 'invalid' }, // 无效的datasetId
                  null, // null值
                  { datasetId: '' }, // 空字符串
                  { datasetId: datasetId1, name: 'Dataset 1 duplicate' } // 重复
                ]
              } as any,
              {
                key: 'other_input',
                value: 'some_value'
              } as any
            ],
            outputs: []
          } as StoreNodeItemType,
          {
            nodeId: 'node_2',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            name: 'Other Node',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: 'should_not_included' }] // 非datasetSearchNode
              } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      } as AppSchema;

      const datasetIds = extractDatasetIdsFromApp(app);

      expect(datasetIds).toEqual([datasetId1, datasetId2, 'invalid', datasetId1]);
    });

    test('没有数据集搜索节点时应返回空数组', () => {
      const app = {
        _id: 'app_123',
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app description',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'node_1',
            flowNodeType: FlowNodeTypeEnum.workflowStart,
            name: 'Other Node',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: datasetId1 }]
              } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      } as AppSchema;

      const datasetIds = extractDatasetIdsFromApp(app);

      expect(datasetIds).toEqual([]);
    });

    test('数据集输入格式不正确时应过滤无效项', () => {
      const app = {
        _id: 'app_123',
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app description',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'node_1',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            name: 'Dataset Search Node',
            inputs: [
              {
                key: 'datasets',
                value: 'not_an_array' // 非数组格式
              } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      } as AppSchema;

      const datasetIds = extractDatasetIdsFromApp(app);

      expect(datasetIds).toEqual([]);
    });
  });

  describe('sampleDataFromDataset', () => {
    test('应该正确采样指定数量的数据（random模式）', async () => {
      const mockData = [
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Question 1',
          a: 'Answer 1',
          indexes: []
        },
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Question 2',
          a: 'Answer 2',
          indexes: []
        },
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Question 3',
          a: 'Answer 3',
          indexes: []
        }
      ];

      (MongoDatasetData.countDocuments as any).mockResolvedValue(3);
      (MongoDatasetData.aggregate as any).mockResolvedValue(mockData);

      const samples = await sampleDataFromDataset([datasetId1], {
        datasetType: 'random',
        sampleSize: 3
      });

      expect(samples).toHaveLength(3);
      expect(samples[0]).toMatchObject({
        datasetId: datasetId1,
        q: 'Question 1',
        a: 'Answer 1',
        indexes: []
      });
      expect(samples[1]).toMatchObject({
        datasetId: datasetId1,
        q: 'Question 2',
        a: 'Answer 2',
        indexes: []
      });
    });

    test('默认应该采样80%的数据', async () => {
      const mockData = Array.from({ length: 10 }, (_, i) => ({
        _id: new Types.ObjectId(),
        datasetId: new Types.ObjectId(datasetId1),
        q: `Question ${i + 1}`,
        a: `Answer ${i + 1}`,
        indexes: []
      }));

      // Mock countDocuments返回总数
      (MongoDatasetData.countDocuments as any).mockResolvedValue(10);
      (MongoDatasetData.aggregate as any).mockResolvedValue(mockData.slice(0, 8)); // 80% = 8条

      const samples = await sampleDataFromDataset([datasetId1]);

      expect(samples).toHaveLength(8);
      expect(MongoDatasetData.countDocuments).toHaveBeenCalled();
      expect(MongoDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ $match: expect.any(Object) }),
          expect.objectContaining({ $limit: 8 }),
          expect.objectContaining({ $project: expect.any(Object) })
        ])
      );
    });

    test('datasetType=train 应该采样前80%的数据', async () => {
      const mockData = Array.from({ length: 10 }, (_, i) => ({
        _id: new Types.ObjectId(),
        datasetId: new Types.ObjectId(datasetId1),
        q: `Question ${i + 1}`,
        a: `Answer ${i + 1}`,
        indexes: []
      }));

      // Mock countDocuments返回总数
      (MongoDatasetData.countDocuments as any).mockResolvedValue(10);
      (MongoDatasetData.aggregate as any).mockResolvedValue(mockData.slice(0, 8)); // 80% = 8条

      const samples = await sampleDataFromDataset([datasetId1], { datasetType: 'train' });

      expect(samples).toHaveLength(8);
      expect(MongoDatasetData.countDocuments).toHaveBeenCalled();
      expect(MongoDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ $match: expect.any(Object) }),
          expect.objectContaining({ $limit: 8 }),
          expect.objectContaining({ $project: expect.any(Object) })
        ])
      );
    });

    test('datasetType=eval 应该采样后20%的数据', async () => {
      const mockData = Array.from({ length: 10 }, (_, i) => ({
        _id: new Types.ObjectId(),
        datasetId: new Types.ObjectId(datasetId1),
        q: `Question ${i + 1}`,
        a: `Answer ${i + 1}`,
        indexes: []
      }));

      // Mock countDocuments返回总数
      (MongoDatasetData.countDocuments as any).mockResolvedValue(10);
      (MongoDatasetData.aggregate as any).mockResolvedValue(mockData.slice(8, 10)); // 后20% = 2条

      const samples = await sampleDataFromDataset([datasetId1], { datasetType: 'eval' });

      expect(samples).toHaveLength(2);
      expect(MongoDatasetData.countDocuments).toHaveBeenCalled();
      expect(MongoDatasetData.aggregate).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ $match: expect.any(Object) }),
          expect.objectContaining({ $skip: 8 }), // 跳过前80%
          expect.objectContaining({ $limit: 2 }), // 取后20%
          expect.objectContaining({ $project: expect.any(Object) })
        ])
      );
    });

    test('训练集和评测集应该不重叠', async () => {
      const totalData = Array.from({ length: 10 }, (_, i) => ({
        _id: new Types.ObjectId(),
        datasetId: new Types.ObjectId(datasetId1),
        q: `Question ${i + 1}`,
        a: `Answer ${i + 1}`,
        indexes: []
      }));

      // Mock countDocuments返回总数
      (MongoDatasetData.countDocuments as any).mockResolvedValue(10);

      // 第一次调用：训练集（前8条）- 创建新的ID数组
      const trainData = totalData.slice(0, 8).map((d) => ({
        ...d,
        _id: new Types.ObjectId()
      }));
      (MongoDatasetData.aggregate as any).mockResolvedValueOnce(trainData);
      const trainSamples = await sampleDataFromDataset([datasetId1], { datasetType: 'train' });

      // 第二次调用：评测集（后2条）- 创建新的ID数组
      const evalData = totalData.slice(8, 10).map((d) => ({
        ...d,
        _id: new Types.ObjectId()
      }));
      (MongoDatasetData.aggregate as any).mockResolvedValueOnce(evalData);
      const evalSamples = await sampleDataFromDataset([datasetId1], { datasetType: 'eval' });

      // 验证数量
      expect(trainSamples).toHaveLength(8);
      expect(evalSamples).toHaveLength(2);

      // 验证训练集和评测集的ID不重叠
      const trainIds = new Set(trainSamples.map((s) => s.dataId));
      const evalIds = new Set(evalSamples.map((s) => s.dataId));

      for (const evalId of evalIds) {
        expect(trainIds.has(evalId)).toBe(false);
      }

      // 验证训练集和评测集的内容不同
      expect(trainSamples[0].q).toBe('Question 1');
      expect(trainSamples[7].q).toBe('Question 8');
      expect(evalSamples[0].q).toBe('Question 9');
      expect(evalSamples[1].q).toBe('Question 10');
    });

    test('应该处理多个数据集的采样', async () => {
      const mockData1 = [
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Dataset 1 Question 1',
          a: 'Dataset 1 Answer 1',
          indexes: []
        }
      ];

      const mockData2 = [
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId2),
          q: 'Dataset 2 Question 1',
          a: 'Dataset 2 Answer 1',
          indexes: []
        }
      ];

      // Mock聚合管道分别调用两次
      (MongoDatasetData.aggregate as any)
        .mockResolvedValueOnce(mockData1)
        .mockResolvedValueOnce(mockData2);

      const samples = await sampleDataFromDataset([datasetId1, datasetId2], {
        datasetType: 'random',
        sampleSize: 1
      });

      expect(samples).toHaveLength(2);
      expect(samples[0]).toMatchObject({
        datasetId: datasetId1,
        q: 'Dataset 1 Question 1'
      });
      expect(samples[1]).toMatchObject({
        datasetId: datasetId2,
        q: 'Dataset 2 Question 1'
      });
    });

    test('应该正确处理只有q字段没有a字段的数据', async () => {
      const mockData = [
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Question only',
          a: '',
          indexes: []
        },
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Question with null a',
          a: null,
          indexes: []
        },
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Question with undefined a',
          a: undefined,
          indexes: []
        }
      ];

      (MongoDatasetData.aggregate as any).mockResolvedValue(mockData);

      const samples = await sampleDataFromDataset([datasetId1], {
        datasetType: 'random',
        sampleSize: 3
      });

      expect(samples).toHaveLength(3);
      expect(samples[0].q).toBe('Question only');
      expect(samples[1].q).toBe('Question with null a');
      expect(samples[2].q).toBe('Question with undefined a');
    });

    test('空数据集应该返回空数组', async () => {
      (MongoDatasetData.countDocuments as any).mockResolvedValue(0);

      const samples = await sampleDataFromDataset([datasetId1]);

      expect(samples).toHaveLength(0);
    });

    test('数据总量小于采样数量时应该返回所有数据', async () => {
      const mockData = [
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Only question',
          a: '',
          indexes: []
        }
      ];

      (MongoDatasetData.countDocuments as any).mockResolvedValue(1);
      (MongoDatasetData.aggregate as any).mockResolvedValue(mockData);

      const samples = await sampleDataFromDataset([datasetId1], {
        datasetType: 'random',
        sampleSize: 5
      });

      expect(samples).toHaveLength(1);
    });

    test('应该使用正确的聚合管道格式', async () => {
      const mockData = [
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Test question',
          a: 'Test answer',
          indexes: []
        }
      ];

      (MongoDatasetData.countDocuments as any).mockResolvedValue(1);
      (MongoDatasetData.aggregate as any).mockResolvedValue(mockData);

      await sampleDataFromDataset([datasetId1], { datasetType: 'random', sampleSize: 1 });

      // 验证聚合管道的调用
      expect(MongoDatasetData.aggregate).toHaveBeenCalledWith([
        {
          $match: {
            datasetId: expect.any(Object)
          }
        },
        {
          $sample: { size: 1 }
        },
        {
          $project: {
            _id: 1,
            q: 1,
            a: 1,
            indexes: 1,
            datasetId: 1,
            collectionId: 1
          }
        }
      ]);
    });

    test('应该记录适当的调试日志', async () => {
      const { addLog } = await import('@fastgpt/service/common/system/log');

      const mockData = [
        {
          _id: new Types.ObjectId(),
          datasetId: new Types.ObjectId(datasetId1),
          q: 'Test question',
          a: 'Test answer',
          indexes: []
        }
      ];

      (MongoDatasetData.countDocuments as any).mockResolvedValue(1);
      (MongoDatasetData.aggregate as any).mockResolvedValue(mockData);

      await sampleDataFromDataset([datasetId1], { datasetType: 'random', sampleSize: 1 });

      // 验证日志调用
      expect(addLog.info).toHaveBeenCalledWith('Sampling data from dataset', {
        datasetId: datasetId1,
        datasetType: 'random',
        sampleSize: 1
      });

      expect(addLog.info).toHaveBeenCalledWith('Dataset sampling result', {
        datasetId: datasetId1,
        datasetType: 'random',
        sampleCount: 1
      });

      expect(addLog.info).toHaveBeenCalledWith('Final sampling result', {
        totalDatasets: 1,
        datasetType: 'random',
        totalSamples: 1
      });
    });
  });
});
