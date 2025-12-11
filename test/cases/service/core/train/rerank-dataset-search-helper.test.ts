import { describe, test, expect, vi, beforeEach } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import { performDatasetSearch } from '@fastgpt/service/core/train/rerank/task/helpers/dataset-search';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

// Mock workflow dispatch
vi.mock('@fastgpt/service/core/workflow/dispatch/dataset/search', () => ({
  dispatchDatasetSearch: vi.fn()
}));

describe('Dataset Search Helper', () => {
  let teamId: string;
  let tmbId: string;
  let appId: string;
  let taskId: string;
  let trainsetId: string;

  beforeEach(() => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439014';
    appId = '507f1f77bcf86cd799439012';
    taskId = '507f1f77bcf86cd799439013';
    trainsetId = '507f1f77bcf86cd799439015';
    vi.clearAllMocks();
  });

  describe('performDatasetSearch', () => {
    test('应该正确构建数据集检索参数', async () => {
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask: RerankTrainTaskSchemaType = {
        _id: taskId,
        teamId,
        tmbId,
        appId,
        trainsetId,
        name: 'Test Task',
        status: 'preparing' as any,
        baseModelConfigId: 'base_model_123',
        baseModelEndpoint: {
          base_url: 'http://test.com',
          model: 'test-model',
          api_key: 'test-key'
        },
        createTime: new Date(),
        updateTime: new Date(),
        checkpoint: {} as any
      };

      const mockApp: AppSchema = {
        _id: appId,
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'dataset_search_1',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            name: '知识库搜索',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset1' }, { datasetId: 'dataset2' }]
              } as any,
              { key: 'similarity', value: 0.7 } as any,
              { key: 'limit', value: 100 } as any,
              { key: 'searchMode', value: 'embedding' } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      const mockSearchResponse = {
        data: {
          quoteQA: [
            {
              id: 'result1',
              q: 'Question 1',
              a: 'Answer 1',
              score: 0.9
            },
            {
              id: 'result2',
              q: 'Question 2',
              a: 'Answer 2',
              score: 0.8
            }
          ]
        }
      };

      (dispatchDatasetSearch as any).mockResolvedValue(mockSearchResponse);

      const query = '测试查询';
      const results = await performDatasetSearch(mockTask, mockApp, query);

      // 验证调用参数
      expect(dispatchDatasetSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'test',
          timezone: 'Asia/Shanghai',
          uid: tmbId,
          query: [],
          stream: false,
          runningAppInfo: {
            id: appId,
            teamId,
            tmbId
          },
          runningUserInfo: {
            username: '',
            teamName: '',
            memberName: '',
            contact: '',
            teamId,
            tmbId
          },
          node: expect.objectContaining({
            nodeId: 'dataset_search',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode
          }),
          params: expect.objectContaining({
            datasets: [{ datasetId: 'dataset1' }, { datasetId: 'dataset2' }],
            similarity: 0.7,
            limit: 100,
            searchMode: 'embedding',
            userChatInput: query,
            usingReRank: false, // 评测时不使用 rerank
            rerankModel: undefined
          })
        })
      );

      // 验证返回结果
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 'result1',
        q: 'Question 1',
        a: 'Answer 1',
        score: 0.9
      });
      expect(results[1]).toEqual({
        id: 'result2',
        q: 'Question 2',
        a: 'Answer 2',
        score: 0.8
      });
    });

    test('应该使用默认搜索参数如果应用未配置', async () => {
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask: RerankTrainTaskSchemaType = {
        _id: taskId,
        teamId,
        tmbId,
        appId,
        trainsetId,
        name: 'Test Task',
        status: 'preparing' as any,
        baseModelConfigId: 'base_model_123',
        baseModelEndpoint: {
          base_url: 'http://test.com',
          model: 'test-model',
          api_key: 'test-key'
        },
        createTime: new Date(),
        updateTime: new Date(),
        checkpoint: {} as any
      };

      const mockApp: AppSchema = {
        _id: appId,
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'dataset_search_1',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            name: '知识库搜索',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset1' }]
              } as any
              // 缺少其他搜索参数
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      const mockSearchResponse = {
        data: {
          quoteQA: []
        }
      };

      (dispatchDatasetSearch as any).mockResolvedValue(mockSearchResponse);

      await performDatasetSearch(mockTask, mockApp, '测试查询');

      // 验证使用了默认参数
      expect(dispatchDatasetSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            similarity: 0.4, // DEFAULT_SEARCH_SIMILARITY
            limit: 5000, // DEFAULT_SEARCH_LIMIT
            searchMode: 'embedding',
            usingReRank: false
          })
        })
      );
    });

    test('应该正确处理空的检索结果', async () => {
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask: RerankTrainTaskSchemaType = {
        _id: taskId,
        teamId,
        tmbId,
        appId,
        trainsetId,
        name: 'Test Task',
        status: 'preparing' as any,
        baseModelConfigId: 'base_model_123',
        baseModelEndpoint: {
          base_url: 'http://test.com',
          model: 'test-model',
          api_key: 'test-key'
        },
        createTime: new Date(),
        updateTime: new Date(),
        checkpoint: {} as any
      };

      const mockApp: AppSchema = {
        _id: appId,
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'dataset_search_1',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            name: '知识库搜索',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset1' }]
              } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      // 模拟空结果
      (dispatchDatasetSearch as any).mockResolvedValue({
        data: {
          quoteQA: []
        }
      });

      const results = await performDatasetSearch(mockTask, mockApp, '没有结果的查询');

      expect(results).toEqual([]);
    });

    test('应该禁用 rerank 进行评测数据集生成', async () => {
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask: RerankTrainTaskSchemaType = {
        _id: taskId,
        teamId,
        tmbId,
        appId,
        trainsetId,
        name: 'Test Task',
        status: 'preparing' as any,
        baseModelConfigId: 'base_model_123',
        baseModelEndpoint: {
          base_url: 'http://test.com',
          model: 'test-model',
          api_key: 'test-key'
        },
        createTime: new Date(),
        updateTime: new Date(),
        checkpoint: {} as any
      };

      const mockApp: AppSchema = {
        _id: appId,
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'dataset_search_1',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            name: '知识库搜索',
            inputs: [
              {
                key: 'datasets',
                value: [{ datasetId: 'dataset1' }]
              } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      (dispatchDatasetSearch as any).mockResolvedValue({
        data: { quoteQA: [] }
      });

      await performDatasetSearch(mockTask, mockApp, '测试查询');

      // 验证 rerank 被禁用
      expect(dispatchDatasetSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            usingReRank: false,
            rerankModel: undefined
          })
        })
      );
    });

    test('应该提取所有数据集ID并构建正确的数据集列表', async () => {
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask: RerankTrainTaskSchemaType = {
        _id: taskId,
        teamId,
        tmbId,
        appId,
        trainsetId,
        name: 'Test Task',
        status: 'preparing' as any,
        baseModelConfigId: 'base_model_123',
        baseModelEndpoint: {
          base_url: 'http://test.com',
          model: 'test-model',
          api_key: 'test-key'
        },
        createTime: new Date(),
        updateTime: new Date(),
        checkpoint: {} as any
      };

      const mockApp: AppSchema = {
        _id: appId,
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'dataset_search_1',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            name: '知识库搜索',
            inputs: [
              {
                key: 'datasets',
                value: [
                  { datasetId: 'ds1', name: 'Dataset 1' },
                  { datasetId: 'ds2', name: 'Dataset 2' },
                  { datasetId: 'ds3', name: 'Dataset 3' }
                ]
              } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      (dispatchDatasetSearch as any).mockResolvedValue({
        data: { quoteQA: [] }
      });

      await performDatasetSearch(mockTask, mockApp, '测试');

      expect(dispatchDatasetSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            datasets: [{ datasetId: 'ds1' }, { datasetId: 'ds2' }, { datasetId: 'ds3' }]
          })
        })
      );
    });
  });
});
