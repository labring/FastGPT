import { describe, test, expect, vi, beforeEach } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { AppSchema } from '@fastgpt/global/core/app/type';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  pLimit,
  extractModelFromApp,
  extractDatasetSearchParamsFromApp,
  buildModelEndpoint
} from '@fastgpt/service/core/train/rerank/utils';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

// Mock dependencies
vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('Rerank Utils', () => {
  let teamId: string;
  let tmbId: string;

  beforeEach(() => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439014';
    vi.clearAllMocks();
  });

  describe('pLimit', () => {
    test('应该限制并发执行数量', async () => {
      const limit = pLimit(2);
      const results: number[] = [];
      const delays = [50, 30, 20, 40];

      const tasks = delays.map((delay, index) =>
        limit(async () => {
          await new Promise((resolve) => setTimeout(resolve, delay));
          results.push(index);
          return index;
        })
      );

      await Promise.all(tasks);

      // 所有任务都应该完成
      expect(results).toHaveLength(4);
      expect(results.sort()).toEqual([0, 1, 2, 3]);
    });

    test('应该处理并发任务错误', async () => {
      const limit = pLimit(2);

      const tasks = [
        limit(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'success1';
        }),
        limit(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          throw new Error('Task failed');
        }),
        limit(async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'success2';
        })
      ];

      const results = await Promise.allSettled(tasks);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
    });

    test('应该正确处理并发数为1的情况', async () => {
      const limit = pLimit(1);
      const executionOrder: number[] = [];

      const tasks = [
        limit(async () => {
          executionOrder.push(1);
          await new Promise((resolve) => setTimeout(resolve, 30));
        }),
        limit(async () => {
          executionOrder.push(2);
          await new Promise((resolve) => setTimeout(resolve, 20));
        }),
        limit(async () => {
          executionOrder.push(3);
          await new Promise((resolve) => setTimeout(resolve, 10));
        })
      ];

      await Promise.all(tasks);

      // 并发数为1时，应该按顺序执行
      expect(executionOrder).toEqual([1, 2, 3]);
    });

    test('应该正确返回异步函数的结果', async () => {
      const limit = pLimit(3);

      const results = await Promise.all([
        limit(async () => 'result1'),
        limit(async () => 42),
        limit(async () => ({ key: 'value' }))
      ]);

      expect(results).toEqual(['result1', 42, { key: 'value' }]);
    });
  });

  describe('extractModelFromApp', () => {
    test('应该从应用工作流中提取显式配置的模型', () => {
      const app: AppSchema = {
        _id: 'app_123',
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'chat_node_1',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            name: 'AI 对话',
            inputs: [
              {
                key: NodeInputKeyEnum.aiModel,
                value: 'gpt-4'
              } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      const getDefaultModel = vi.fn(() => ({ model: 'gpt-3.5-turbo' }));

      const modelId = extractModelFromApp(
        app,
        FlowNodeTypeEnum.chatNode,
        NodeInputKeyEnum.aiModel,
        getDefaultModel
      );

      expect(modelId).toBe('gpt-4');
      expect(getDefaultModel).not.toHaveBeenCalled();
    });

    test('应该使用默认模型如果应用未显式配置', () => {
      const app: AppSchema = {
        _id: 'app_123',
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'chat_node_1',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            name: 'AI 对话',
            inputs: [] as FlowNodeInputItemType[] // 没有配置模型
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      const getDefaultModel = vi.fn(() => ({ model: 'gpt-3.5-turbo' }));

      const modelId = extractModelFromApp(
        app,
        FlowNodeTypeEnum.chatNode,
        NodeInputKeyEnum.aiModel,
        getDefaultModel
      );

      expect(modelId).toBe('gpt-3.5-turbo');
      expect(getDefaultModel).toHaveBeenCalled();
    });

    test('应该抛出错误如果没有默认模型可用', () => {
      const app: AppSchema = {
        _id: 'app_123',
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app',
        updateTime: new Date(),
        modules: [] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      const getDefaultModel = vi.fn(() => undefined);

      expect(() =>
        extractModelFromApp(
          app,
          FlowNodeTypeEnum.chatNode,
          NodeInputKeyEnum.aiModel,
          getDefaultModel
        )
      ).toThrow(/No default model available/);
    });

    test('应该从第一个匹配节点中提取模型', () => {
      const app: AppSchema = {
        _id: 'app_123',
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'chat_node_1',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            name: 'AI 对话 1',
            inputs: [
              {
                key: NodeInputKeyEnum.aiModel,
                value: 'gpt-4'
              } as any
            ],
            outputs: []
          } as StoreNodeItemType,
          {
            nodeId: 'chat_node_2',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            name: 'AI 对话 2',
            inputs: [
              {
                key: NodeInputKeyEnum.aiModel,
                value: 'gpt-3.5-turbo'
              } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      const getDefaultModel = vi.fn(() => ({ model: 'default-model' }));

      const modelId = extractModelFromApp(
        app,
        FlowNodeTypeEnum.chatNode,
        NodeInputKeyEnum.aiModel,
        getDefaultModel
      );

      // 应该返回第一个节点的模型
      expect(modelId).toBe('gpt-4');
    });

    test('应该正确处理模型值为不同类型的情况', () => {
      const app: AppSchema = {
        _id: 'app_123',
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'chat_node_1',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            name: 'AI 对话',
            inputs: [
              {
                key: NodeInputKeyEnum.aiModel,
                value: 12345 // 数字类型
              } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      const getDefaultModel = vi.fn(() => ({ model: 'default-model' }));

      const modelId = extractModelFromApp(
        app,
        FlowNodeTypeEnum.chatNode,
        NodeInputKeyEnum.aiModel,
        getDefaultModel
      );

      // 应该转换为字符串
      expect(modelId).toBe('12345');
    });
  });

  describe('extractDatasetSearchParamsFromApp', () => {
    test('应该从应用配置中提取数据集搜索参数', () => {
      const app: AppSchema = {
        _id: 'app_123',
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
              { key: 'similarity', value: 0.7 } as any,
              { key: 'limit', value: 100 } as any,
              { key: 'searchMode', value: 'embedding' } as any,
              { key: 'embeddingWeight', value: 0.5 } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      const params = extractDatasetSearchParamsFromApp(app);

      expect(params).toEqual({
        similarity: 0.7,
        limit: 100,
        searchMode: 'embedding',
        embeddingWeight: 0.5,
        collectionFilterMatch: undefined,
        datasetSearchUsingExtensionQuery: undefined,
        datasetSearchExtensionModel: undefined,
        datasetSearchExtensionBg: undefined
      });
    });

    test('应该返回默认值如果没有数据集搜索节点', () => {
      const app: AppSchema = {
        _id: 'app_123',
        teamId,
        tmbId,
        type: 'simple' as any,
        name: 'Test App',
        avatar: 'test_avatar',
        intro: 'Test app',
        updateTime: new Date(),
        modules: [
          {
            nodeId: 'chat_node_1',
            flowNodeType: FlowNodeTypeEnum.chatNode,
            name: 'AI 对话',
            inputs: [],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      const params = extractDatasetSearchParamsFromApp(app);

      expect(params).toEqual({
        similarity: 0.4, // DEFAULT_SEARCH_SIMILARITY
        limit: 5000, // DEFAULT_SEARCH_LIMIT
        searchMode: 'embedding'
      });
    });

    test('应该使用默认值填充缺失的参数', () => {
      const app: AppSchema = {
        _id: 'app_123',
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
              { key: 'similarity', value: 0.6 } as any
              // 其他参数缺失
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      const params = extractDatasetSearchParamsFromApp(app);

      expect(params).toEqual({
        similarity: 0.6,
        limit: 5000, // 默认值
        searchMode: 'embedding', // 默认值
        embeddingWeight: undefined,
        collectionFilterMatch: undefined,
        datasetSearchUsingExtensionQuery: undefined,
        datasetSearchExtensionModel: undefined,
        datasetSearchExtensionBg: undefined
      });
    });

    test('应该提取完整的搜索参数配置', () => {
      const app: AppSchema = {
        _id: 'app_123',
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
              { key: 'similarity', value: 0.8 } as any,
              { key: 'limit', value: 50 } as any,
              { key: 'searchMode', value: 'hybrid' } as any,
              { key: 'embeddingWeight', value: 0.3 } as any,
              { key: 'collectionFilterMatch', value: 'filter_match' } as any,
              { key: 'datasetSearchUsingExtensionQuery', value: true } as any,
              { key: 'datasetSearchExtensionModel', value: 'gpt-3.5-turbo' } as any,
              { key: 'datasetSearchExtensionBg', value: 'background_info' } as any
            ],
            outputs: []
          } as StoreNodeItemType
        ] as StoreNodeItemType[],
        edges: [] as StoreEdgeItemType[],
        chatConfig: {} as any,
        teamTags: []
      };

      const params = extractDatasetSearchParamsFromApp(app);

      expect(params).toEqual({
        similarity: 0.8,
        limit: 50,
        searchMode: 'hybrid',
        embeddingWeight: 0.3,
        collectionFilterMatch: 'filter_match',
        datasetSearchUsingExtensionQuery: true,
        datasetSearchExtensionModel: 'gpt-3.5-turbo',
        datasetSearchExtensionBg: 'background_info'
      });
    });
  });

  describe('buildModelEndpoint', () => {
    test('应该构建完整的 endpoint 配置', () => {
      const modelConfig = {
        model: 'gpt-4',
        requestUrl: 'https://api.openai.com',
        requestAuth: 'sk-123456'
      };

      const endpoint = buildModelEndpoint(modelConfig);

      expect(endpoint).toEqual({
        model: 'gpt-4',
        base_url: 'https://api.openai.com',
        api_key: 'sk-123456'
      });
    });

    test('应该处理缺少 requestUrl 的情况', () => {
      const modelConfig = {
        model: 'gpt-4',
        requestAuth: 'sk-123456'
      };

      const endpoint = buildModelEndpoint(modelConfig);

      expect(endpoint).toEqual({
        model: 'gpt-4',
        api_key: 'sk-123456'
      });
      expect(endpoint.base_url).toBeUndefined();
    });

    test('应该处理缺少 requestAuth 的情况', () => {
      const modelConfig = {
        model: 'gpt-4',
        requestUrl: 'https://api.openai.com'
      };

      const endpoint = buildModelEndpoint(modelConfig);

      expect(endpoint).toEqual({
        model: 'gpt-4',
        base_url: 'https://api.openai.com'
      });
      expect(endpoint.api_key).toBeUndefined();
    });

    test('应该处理只有 model 字段的最小配置', () => {
      const modelConfig = {
        model: 'gpt-3.5-turbo'
      };

      const endpoint = buildModelEndpoint(modelConfig);

      expect(endpoint).toEqual({
        model: 'gpt-3.5-turbo'
      });
      expect(endpoint.base_url).toBeUndefined();
      expect(endpoint.api_key).toBeUndefined();
    });

    test('应该正确处理空字符串（falsy值不会被添加）', () => {
      const modelConfig = {
        model: '',
        requestUrl: '',
        requestAuth: ''
      };

      const endpoint = buildModelEndpoint(modelConfig);

      // 空字符串是 falsy 值，requestUrl 和 requestAuth 不会被添加
      expect(endpoint).toEqual({
        model: ''
      });
      expect(endpoint.base_url).toBeUndefined();
      expect(endpoint.api_key).toBeUndefined();
    });
  });
});
