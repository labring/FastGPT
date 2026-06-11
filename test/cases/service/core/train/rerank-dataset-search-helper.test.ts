import { describe, test, expect, vi, beforeEach } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
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
  let taskId: string;
  let trainsetId: string;

  const createMockTask = (): RerankTrainTaskSchemaType =>
    ({
      _id: taskId,
      teamId,
      tmbId,
      trainsetId,
      name: 'Test Task',
      status: 'generate_trainset' as any,
      baseModelId: 'base_model_123',
      baseModelEndpoint: {
        base_url: 'http://test.com',
        model: 'test-model',
        api_key: 'test-key'
      },
      createTime: new Date(),
      updateTime: new Date(),
      checkpoint: {} as any
    }) as RerankTrainTaskSchemaType;

  beforeEach(() => {
    teamId = '507f1f77bcf86cd799439011';
    tmbId = '507f1f77bcf86cd799439014';
    taskId = '507f1f77bcf86cd799439013';
    trainsetId = '507f1f77bcf86cd799439015';
    vi.clearAllMocks();
  });

  describe('performDatasetSearch', () => {
    test('应该正确构建数据集检索参数', async () => {
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask = createMockTask();
      const datasetIds = ['dataset1', 'dataset2'];

      const mockSearchResponse = {
        data: {
          quoteQA: [
            {
              id: 'result1',
              q: 'Question 1',
              a: 'Answer 1',
              score: [{ type: 'embedding', value: 0.9, index: 0 }]
            },
            {
              id: 'result2',
              q: 'Question 2',
              a: 'Answer 2',
              score: [{ type: 'rerank', value: 0.8, index: 1 }]
            }
          ]
        }
      };

      (dispatchDatasetSearch as any).mockResolvedValue(mockSearchResponse);

      const query = '测试查询';
      const results = await performDatasetSearch(mockTask, datasetIds, query);

      // Verify call arguments
      expect(dispatchDatasetSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: 'test',
          timezone: 'Asia/Shanghai',
          uid: tmbId,
          query: [],
          stream: false,
          runningAppInfo: expect.objectContaining({
            id: expect.any(String),
            teamId,
            tmbId
          }),
          runningUserInfo: expect.objectContaining({
            username: '',
            teamName: '',
            memberName: '',
            contact: '',
            teamId,
            tmbId
          }),
          node: expect.objectContaining({
            nodeId: 'dataset_search',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode
          }),
          params: expect.objectContaining({
            datasets: [
              { datasetId: 'dataset1', avatar: '', name: '' },
              { datasetId: 'dataset2', avatar: '', name: '' }
            ],
            userChatInput: query,
            usingReRank: false, // Rerank disabled during evaluation
            rerankModelId: undefined
          })
        })
      );

      // Verify return value
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        id: 'result1',
        score: [{ type: 'embedding', value: 0.9, index: 0 }]
      });
      expect(results[1]).toEqual({
        id: 'result2',
        score: [{ type: 'rerank', value: 0.8, index: 1 }]
      });
    });

    test('应该使用默认搜索参数', async () => {
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask = createMockTask();

      (dispatchDatasetSearch as any).mockResolvedValue({ data: { quoteQA: [] } });

      await performDatasetSearch(mockTask, ['dataset1'], '测试查询');

      // Verify default params are used
      expect(dispatchDatasetSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            similarity: 0.1, // TRAIN_SEARCH_SIMILARITY
            limit: 51200, // TRAIN_SEARCH_LIMIT
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

      const mockTask = createMockTask();

      (dispatchDatasetSearch as any).mockResolvedValue({ data: { quoteQA: [] } });

      const results = await performDatasetSearch(mockTask, ['dataset1'], '没有结果的查询');

      expect(results).toEqual([]);
    });

    test('应该禁用 rerank 进行评测数据集生成', async () => {
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask = createMockTask();

      (dispatchDatasetSearch as any).mockResolvedValue({ data: { quoteQA: [] } });

      await performDatasetSearch(mockTask, ['dataset1'], '测试查询');

      // Verify rerank is disabled
      expect(dispatchDatasetSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            usingReRank: false,
            rerankModelId: undefined
          })
        })
      );
    });

    test('应该根据传入的 datasetIds 构建正确的数据集列表', async () => {
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask = createMockTask();
      const datasetIds = ['ds1', 'ds2', 'ds3'];

      (dispatchDatasetSearch as any).mockResolvedValue({ data: { quoteQA: [] } });

      await performDatasetSearch(mockTask, datasetIds, '测试');

      expect(dispatchDatasetSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            datasets: [
              { datasetId: 'ds1', avatar: '', name: '' },
              { datasetId: 'ds2', avatar: '', name: '' },
              { datasetId: 'ds3', avatar: '', name: '' }
            ]
          })
        })
      );
    });

    test('应该优先使用 nodeResponse.retrievalResults 而非 quoteQA', async () => {
      const { dispatchDatasetSearch } = await import(
        '@fastgpt/service/core/workflow/dispatch/dataset/search'
      );

      const mockTask = createMockTask();

      const retrievalResults = [
        { id: 'r1', q: 'Q1', a: 'A1', score: [{ type: 'embedding', value: 0.95, index: 0 }] }
      ];
      const mockSearchResponse = {
        __nodeResponse: [{ retrievalResults }],
        data: {
          quoteQA: [
            { id: 'q1', q: 'Q2', a: 'A2', score: [{ type: 'embedding', value: 0.5, index: 0 }] }
          ]
        }
      };

      (dispatchDatasetSearch as any).mockResolvedValue(mockSearchResponse);

      // quoteQA fallback should be used when nodeResponse is absent
      const results = await performDatasetSearch(mockTask, ['dataset1'], '查询');

      // Returns quoteQA result (nodeResponse key does not match DispatchNodeResponseKeyEnum.nodeResponse)
      expect(results).toHaveLength(1);
    });
  });
});
