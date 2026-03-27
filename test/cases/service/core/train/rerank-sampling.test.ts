import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Types } from '@fastgpt/service/common/mongo';
import {
  sampleDataFromDataset,
  extractDatasetIdsFromApp
} from '@fastgpt/service/core/train/rerank/utils';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { DatasetDataIndexTypeEnum } from '@fastgpt/global/core/dataset/data/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

/** 创建含有完整 synthesis index 对的 mock 数据 */
function createMockDocWithSynthesisIndexes(
  id: any,
  datasetId: any,
  q: string,
  a: string,
  synIdStart: number = 0
) {
  return {
    _id: id,
    datasetId,
    q,
    a,
    indexes: [
      { type: DatasetDataIndexTypeEnum.synthesis, synId: synIdStart, text: `text_${q}_1` },
      { type: DatasetDataIndexTypeEnum.synthesis, synId: synIdStart, text: `text_${q}_2` }
    ]
  };
}

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
    find: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      })
    }),
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
    // Clean up test data
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
                  { datasetId: 'invalid' }, // Invalid datasetId
                  null, // null value
                  { datasetId: '' }, // Empty string
                  { datasetId: datasetId1, name: 'Dataset 1 duplicate' } // Duplicate
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
                value: [{ datasetId: 'should_not_included' }] // Not a datasetSearchNode
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
                value: 'not_an_array' // Non-array format
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
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          'Question 1',
          'Answer 1',
          0
        ),
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          'Question 2',
          'Answer 2',
          1
        ),
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          'Question 3',
          'Answer 3',
          2
        )
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
        a: 'Answer 1'
      });
      expect(samples[1]).toMatchObject({
        datasetId: datasetId1,
        q: 'Question 2',
        a: 'Answer 2'
      });
    });

    test('默认应该采样80%的数据', async () => {
      const mockDocs = Array.from({ length: 10 }, (_, i) => ({
        _id: new Types.ObjectId()
      }));
      const mockData = Array.from({ length: 8 }, (_, i) =>
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          `Question ${i + 1}`,
          `Answer ${i + 1}`,
          i
        )
      );

      // Mock countDocuments returning total count
      (MongoDatasetData.countDocuments as any).mockResolvedValue(10);
      // train/eval mode calls find() twice: first for ID fetch, second for data fetch
      (MongoDatasetData.find as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockDocs) })
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockData) })
        });

      const samples = await sampleDataFromDataset([datasetId1]);

      expect(samples).toHaveLength(8);
      expect(MongoDatasetData.countDocuments).toHaveBeenCalled();
      expect(MongoDatasetData.find).toHaveBeenCalled();
      // aggregate is NOT called in train/eval mode
      expect(MongoDatasetData.aggregate).not.toHaveBeenCalled();
    });

    test('datasetType=train 应该采样前80%的数据', async () => {
      const mockDocs = Array.from({ length: 10 }, (_, i) => ({
        _id: new Types.ObjectId()
      }));
      const mockData = Array.from({ length: 8 }, (_, i) =>
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          `Question ${i + 1}`,
          `Answer ${i + 1}`,
          i
        )
      );

      // Mock countDocuments returning total count
      (MongoDatasetData.countDocuments as any).mockResolvedValue(10);
      // train mode calls find() twice: first for ID fetch, second for data fetch
      (MongoDatasetData.find as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockDocs) })
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockData) })
        });

      const samples = await sampleDataFromDataset([datasetId1], { datasetType: 'train' });

      expect(samples).toHaveLength(8);
      expect(MongoDatasetData.countDocuments).toHaveBeenCalled();
      expect(MongoDatasetData.find).toHaveBeenCalled();
      // aggregate is NOT called in train mode
      expect(MongoDatasetData.aggregate).not.toHaveBeenCalled();
    });

    test('datasetType=eval 应该采样后20%的数据', async () => {
      const mockDocs = Array.from({ length: 10 }, (_, i) => ({
        _id: new Types.ObjectId()
      }));
      const mockData = Array.from({ length: 2 }, (_, i) =>
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          `Question ${i + 9}`,
          `Answer ${i + 9}`,
          i
        )
      );

      // Mock countDocuments returning total count
      (MongoDatasetData.countDocuments as any).mockResolvedValue(10);
      // eval mode calls find() twice: first for ID fetch, second for data fetch
      (MongoDatasetData.find as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockDocs) })
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(mockData) })
        });

      const samples = await sampleDataFromDataset([datasetId1], { datasetType: 'eval' });

      expect(samples).toHaveLength(2);
      expect(MongoDatasetData.countDocuments).toHaveBeenCalled();
      expect(MongoDatasetData.find).toHaveBeenCalled();
      // aggregate is NOT called in eval mode
      expect(MongoDatasetData.aggregate).not.toHaveBeenCalled();
    });

    test('训练集和评测集应该不重叠', async () => {
      const totalIds = Array.from({ length: 10 }, (_, i) => ({ _id: new Types.ObjectId() }));

      // Mock countDocuments returning total count
      (MongoDatasetData.countDocuments as any).mockResolvedValue(10);

      // First call: training set (first 8 items)
      const trainMockDocs = totalIds.slice(0, 8);
      const trainData = trainMockDocs.map((doc, i) =>
        createMockDocWithSynthesisIndexes(
          doc._id,
          new Types.ObjectId(datasetId1),
          `Question ${i + 1}`,
          `Answer ${i + 1}`,
          i
        )
      );
      // Second call: eval set (last 2 items)
      const evalMockDocs = totalIds.slice(8, 10);
      const evalData = evalMockDocs.map((doc, i) =>
        createMockDocWithSynthesisIndexes(
          doc._id,
          new Types.ObjectId(datasetId1),
          `Question ${i + 9}`,
          `Answer ${i + 9}`,
          i
        )
      );

      // train mode: first find returns all IDs, second find returns train data
      (MongoDatasetData.find as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(totalIds) })
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(trainData) })
        });

      const trainSamples = await sampleDataFromDataset([datasetId1], { datasetType: 'train' });

      // eval mode: first find returns all IDs, second find returns eval data
      (MongoDatasetData.find as any)
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(totalIds) })
        })
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue(evalData) })
        });
      const evalSamples = await sampleDataFromDataset([datasetId1], { datasetType: 'eval' });

      // Verify counts
      expect(trainSamples).toHaveLength(8);
      expect(evalSamples).toHaveLength(2);

      // Verify content differs (via q field)
      expect(trainSamples[0].q).toBe('Question 1');
      expect(evalSamples[0].q).toBe('Question 9');
    });

    test('应该处理多个数据集的采样', async () => {
      const mockData1 = [
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          'Dataset 1 Question 1',
          'Dataset 1 Answer 1',
          0
        )
      ];

      const mockData2 = [
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId2),
          'Dataset 2 Question 1',
          'Dataset 2 Answer 1',
          0
        )
      ];

      // Mock aggregation pipeline called twice separately
      (MongoDatasetData.countDocuments as any).mockResolvedValue(1);
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
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          'Question only',
          '',
          0
        ),
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          'Question with null a',
          null as any,
          1
        ),
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          'Question with undefined a',
          undefined as any,
          2
        )
      ];

      (MongoDatasetData.countDocuments as any).mockResolvedValue(3);
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
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          'Only question',
          '',
          0
        )
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
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          'Test question',
          'Test answer',
          0
        )
      ];

      (MongoDatasetData.countDocuments as any).mockResolvedValue(1);
      (MongoDatasetData.aggregate as any).mockResolvedValue(mockData);

      await sampleDataFromDataset([datasetId1], { datasetType: 'random', sampleSize: 1 });

      // Verify aggregation pipeline calls
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
        createMockDocWithSynthesisIndexes(
          new Types.ObjectId(),
          new Types.ObjectId(datasetId1),
          'Test question',
          'Test answer',
          0
        )
      ];

      (MongoDatasetData.countDocuments as any).mockResolvedValue(1);
      (MongoDatasetData.aggregate as any).mockResolvedValue(mockData);

      await sampleDataFromDataset([datasetId1], { datasetType: 'random', sampleSize: 1 });

      // Verify log calls
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
        totalSamples: 1,
        totalPairs: expect.any(Number)
      });
    });
  });
});
