import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { createNodeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import { createWorkflowResourceContext } from '@fastgpt/service/core/workflow/resource/context';
import { WorkflowResourceError } from '@fastgpt/service/core/workflow/resource/service';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as modelGetters from '../../../../../core/ai/model/catalog/service';

const {
  defaultSearchDatasetDataMock,
  deepRagSearchMock,
  loadWorkflowDatasetResourceMock,
  findDatasetMock,
  getDatasetSearchVlmModelMock,
  formatModelChars2PointsMock,
  usagePushMock,
  mockLogger
} = vi.hoisted(() => ({
  defaultSearchDatasetDataMock: vi.fn(),
  deepRagSearchMock: vi.fn(),
  loadWorkflowDatasetResourceMock: vi.fn(),
  findDatasetMock: vi.fn(),
  getDatasetSearchVlmModelMock: vi.fn(),
  formatModelChars2PointsMock: vi.fn(),
  usagePushMock: vi.fn(),
  mockLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/logger', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/common/logger')>()),
  getLogger: () => mockLogger
}));

vi.mock('@fastgpt/service/core/dataset/search', () => ({
  defaultSearchDatasetData: defaultSearchDatasetDataMock,
  deepRagSearch: deepRagSearchMock
}));

vi.mock('@fastgpt/service/core/dataset/search/vlm', () => ({
  getDatasetSearchVlmModel: getDatasetSearchVlmModelMock
}));

vi.mock('@fastgpt/service/core/workflow/resource/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/workflow/resource/service')>()),
  loadWorkflowDatasetResource: loadWorkflowDatasetResourceMock
}));

vi.mock('@fastgpt/service/core/dataset/schema', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/dataset/schema')>()),
  MongoDataset: {
    find: findDatasetMock
  }
}));

vi.mock('@fastgpt/service/core/dataset/utils', () => ({
  filterDatasetsByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => {
  const handle = {
    getDefaultModelData: vi.fn(),
    getEmbeddingModelData: vi.fn(() => ({
      modelId: '68ad85a7463006c963799a01',
      model: 'embedding-model',
      name: 'Embedding Model',
      type: 'embedding',
      config: {}
    })),
    getLLMModelData: vi.fn(() => ({
      modelId: '68ad85a7463006c963799a02',
      model: 'gpt-query',
      name: 'gpt-query name',
      type: 'llm',
      config: {}
    })),
    getRerankModelData: vi.fn(() => undefined),
    getModelData: vi.fn(
      (
        reference: { modelId?: string; model?: string },
        options?: { type?: string; vision?: boolean }
      ) => {
        if (options?.vision) return (handle.getVlmModelData as any)(reference);
        if (options?.type === 'rerank') return (handle.getRerankModelData as any)(reference);
        if (options?.type === 'embedding') return (handle.getEmbeddingModelData as any)(reference);
        return (handle.getLLMModelData as any)(reference);
      }
    ),
    getVlmModelData: vi.fn(() => ({
      modelId: '68ad85a7463006c963799a03',
      model: 'vision-model',
      name: 'gpt-vision name',
      type: 'llm',
      config: { vision: true }
    })),
    getOptionalVlmModelData: vi.fn(({ modelId, model }) =>
      modelId || model
        ? {
            modelId: '68ad85a7463006c963799a03',
            model: 'vision-model',
            name: 'gpt-vision name',
            type: 'llm',
            config: { vision: true }
          }
        : undefined
    )
  };
  return { getSystemModelHandle: async () => handle, getTeamModelHandle: async () => handle };
});

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: formatModelChars2PointsMock
}));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  assertAuthModels: vi.fn(async () => ({ handle: {}, models: [] })),
  getAuthorizedModelIds: vi.fn(async () => new Set())
}));

import {
  dispatchDatasetSearch,
  isDatasetResourceMissingError
} from '../../../../../core/workflow/dispatch/dataset/search';
import { serviceEnv } from '../../../../../env';

describe('dispatchDatasetSearch', () => {
  const runSearch = (params: Record<string, unknown> = {}, nodeSummary = createNodeSummary()) =>
    dispatchDatasetSearch({
      runningAppInfo: { teamId: 'team_1' },
      runningUserInfo: { tmbId: 'tmb_1' },
      externalProvider: {},
      histories: [],
      node: { name: 'Dataset Search' },
      params: { datasets: [{ datasetId: 'dataset_1' }], userChatInput: 'question', ...params },
      nodeSummary,
      usagePush: usagePushMock
    } as any);

  /** 保留真实资源加载和快照判断，仅替换数据库查询，验证错误分类的完整路径。 */
  const runSnapshotSearch = async () => {
    const { loadWorkflowDatasetResource } = await vi.importActual<
      typeof import('@fastgpt/service/core/workflow/resource/service')
    >('@fastgpt/service/core/workflow/resource/service');
    loadWorkflowDatasetResourceMock.mockImplementationOnce(loadWorkflowDatasetResource);

    return runWithContext(
      {
        mcpClientMemory: {},
        resourceContext: createWorkflowResourceContext({
          resources: [{ type: 'dataset', id: 'dataset_1' }],
          teamId: 'team_1'
        })
      },
      () => runSearch()
    );
  };

  it('preserves mappings across quoteQA, node response and tool cites', async () => {
    const quote = {
      id: 'chunk',
      q: 'alias',
      a: '',
      sourceName: 'source',
      synonymMappings: { alias: 'standard' },
      synonymMappingsTruncated: true
    };
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [quote],
      retrievalResults: [quote],
      embeddingTokens: 0,
      reRankInputTokens: 0,
      usingReRank: false
    });
    const previous = serviceEnv.DATASET_SYNONYM_ENABLED;
    serviceEnv.DATASET_SYNONYM_ENABLED = true;
    let result;
    try {
      result = await runSearch();
    } finally {
      serviceEnv.DATASET_SYNONYM_ENABLED = previous;
    }
    expect(result.data?.quoteQA[0]).toMatchObject(quote);
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.quoteList?.[0]).toMatchObject(quote);
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.retrievalResults?.[0]).toMatchObject(
      quote
    );
    expect(result[DispatchNodeResponseKeyEnum.toolResponse]).toMatchObject({
      cites: [{ synonymMappings: { alias: 'standard' }, synonymMappingsTruncated: true }]
    });
  });

  it('executes and bills the fallback auxiliary models when configured models are unavailable', async () => {
    vi.mocked((await modelGetters.getSystemModelHandle()).getLLMModelData).mockImplementationOnce(
      () => {
        throw new UserError(ModelErrEnum.unExist);
      }
    );
    vi.mocked(
      (await modelGetters.getSystemModelHandle()).getRerankModelData
    ).mockImplementationOnce(() => {
      throw new UserError(ModelErrEnum.unConfigured);
    });
    vi.mocked((await modelGetters.getSystemModelHandle()).getDefaultModelData).mockImplementation(
      (slot) =>
        ({
          modelId: `fallback-${slot}`,
          model: `fallback-${slot}`,
          name: `Fallback ${slot}`,
          type: slot,
          config: {}
        }) as any
    );
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 0,
      reRankInputTokens: 10,
      usingReRank: true,
      queryExtensionResult: {
        inputTokens: 3,
        outputTokens: 2,
        embeddingTokens: 0,
        requestId: 'fallback-request',
        seconds: 0,
        query: 'expanded'
      }
    });
    const nodeSummary = createNodeSummary();
    const result = await runSearch(
      {
        usingReRank: true,
        datasetSearchUsingExtensionQuery: true,
        datasetSearchExtensionModelId: 'deleted'
      },
      nodeSummary
    );
    expect(nodeSummary).toMatchObject({ llmInputTokens: 0, llmOutputTokens: 0 });
    expect(result.error).toBeUndefined();
    expect(defaultSearchDatasetDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rerankModel: expect.objectContaining({ modelId: 'fallback-rerank' }),
        datasetSearchExtensionModel: expect.objectContaining({ modelId: 'fallback-llm' })
      })
    );
    expect(usagePushMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ modelId: 'fallback-rerank' }),
        expect.objectContaining({ modelId: 'fallback-llm' })
      ])
    );
  });

  it('still fails immediately when the embedding model is unavailable', async () => {
    vi.mocked(
      (await modelGetters.getSystemModelHandle()).getEmbeddingModelData
    ).mockImplementationOnce(() => {
      throw new UserError(ModelErrEnum.unExist);
    });
    const result = await runSearch({ usingReRank: true, datasetSearchUsingExtensionQuery: true });
    expect(result.error).toBeDefined();
    expect(defaultSearchDatasetDataMock).not.toHaveBeenCalled();
    expect((await modelGetters.getSystemModelHandle()).getDefaultModelData).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    getDatasetSearchVlmModelMock.mockResolvedValue({
      modelId: '68ad85a7463006c963799a03',
      model: 'vision-model',
      name: 'gpt-vision name',
      type: 'llm',
      config: { vision: true }
    });
    loadWorkflowDatasetResourceMock.mockResolvedValue({
      vectorModel: 'embedding-model',
      vlmModel: 'gpt-vision'
    });
    formatModelChars2PointsMock.mockImplementation(
      ({
        model,
        inputTokens = 0,
        outputTokens = 0
      }: {
        model?: string | { model: string; name: string };
        inputTokens?: number;
        outputTokens?: number;
      }) => ({
        modelName: typeof model === 'string' ? `${model || 'unknown'} name` : model?.name,
        totalPoints: (inputTokens + outputTokens) / 100
      })
    );
  });

  it('continues text search when all selected VLM models are unusable', async () => {
    getDatasetSearchVlmModelMock.mockResolvedValue(undefined);
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 0,
      reRankInputTokens: 0,
      usingReRank: false
    });
    const result = await dispatchDatasetSearch({
      runningAppInfo: { teamId: 'team_1' },
      runningUserInfo: { tmbId: 'tmb_1' },
      externalProvider: {},
      histories: [],
      node: { name: 'Dataset Search' },
      params: {
        datasets: [{ datasetId: 'first' }, { datasetId: 'second' }],
        userChatInput: 'question'
      },
      nodeSummary: createNodeSummary(),
      usagePush: usagePushMock
    } as any);
    expect(getDatasetSearchVlmModelMock).toHaveBeenCalledWith({
      teamId: 'team_1',
      datasetIds: ['first', 'second'],
      modelHandle: await modelGetters.getSystemModelHandle()
    });
    expect(defaultSearchDatasetDataMock).toHaveBeenCalledWith(
      expect.objectContaining({ vlmModel: undefined })
    );
    expect(result.error).toBeUndefined();
    expect(result.data?.quoteQA).toEqual([]);
  });

  it('passes collectionFilterMatch directly to defaultSearchDatasetData', async () => {
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 0,
      reRankInputTokens: 0,
      usingSimilarityFilter: false,
      usingReRank: false
    });
    const props = {
      runningAppInfo: { teamId: 'team_1' },
      runningUserInfo: { tmbId: 'tmb_1' },
      externalProvider: {},
      histories: [],
      node: { name: 'Dataset Search' },
      params: {
        datasets: [{ datasetId: 'dataset_1' }],
        similarity: 0.4,
        limit: 5000,
        userChatInput: 'query',
        searchMode: DatasetSearchModeEnum.embedding,
        usingReRank: false,
        datasetSearchUsingExtensionQuery: false,
        collectionFilterMatch: '{"tags":{"$and":["legacy"]}}'
      },
      nodeSummary: createNodeSummary(),
      usagePush: usagePushMock
    } as any;

    await dispatchDatasetSearch(props);

    expect(defaultSearchDatasetDataMock.mock.calls[0][0]).toMatchObject({
      collectionFilterMatch: '{"tags":{"$and":["legacy"]}}'
    });
  });

  it('adds query extension as a child node response of dataset search', async () => {
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [
        {
          id: 'chunk_1',
          q: 'question',
          a: 'answer',
          sourceName: 'doc.md'
        }
      ],
      embeddingTokens: 20,
      reRankInputTokens: 0,
      usingSimilarityFilter: true,
      usingReRank: false,
      queryExtensionResult: {
        llmModel: 'gpt-query',
        requestId: 'req_query_extension',
        seconds: 1.2,
        inputTokens: 10,
        outputTokens: 5,
        usedUserOpenAIKey: false,
        embeddingModel: 'embedding-query',
        embeddingTokens: 6,
        query: 'origin\nexpanded'
      }
    });

    const result = await dispatchDatasetSearch({
      runningAppInfo: { teamId: 'team_1' },
      runningUserInfo: { tmbId: 'tmb_1' },
      externalProvider: {},
      histories: [],
      node: { name: 'Dataset Search' },
      params: {
        datasets: [{ datasetId: 'dataset_1' }],
        similarity: 0.4,
        limit: 5000,
        userChatInput: 'origin',
        authTmbId: false,
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.5,
        usingReRank: false,
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: true
      },
      nodeSummary: createNodeSummary(),
      usagePush: usagePushMock
    } as any);

    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(nodeResponse).not.toHaveProperty('queryExtensionResult');
    expect(nodeResponse?.childrenResponses).toEqual([
      expect.objectContaining({
        id: 'req_query_extension',
        nodeId: 'req_query_extension',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        moduleName: 'common:core.module.template.Query extension',
        moduleLogo: 'core/workflow/template/datasetSearch',
        runningTime: 1.2,
        model: 'gpt-query name',
        llmRequestIds: ['req_query_extension'],
        inputTokens: 10,
        outputTokens: 5,
        totalPoints: 0.15,
        textOutput: 'origin\nexpanded'
      })
    ]);
    expect(nodeResponse?.childTotalPoints).toBeUndefined();
    expect(nodeResponse?.totalPoints).toBeCloseTo(0.26);
    expect(usagePushMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'common:core.module.template.Query extension',
          totalPoints: 0.15
        })
      ])
    );
  });

  it('sets query extension LLM points to zero only when external OpenAI key is valid', async () => {
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 20,
      reRankInputTokens: 0,
      usingSimilarityFilter: true,
      usingReRank: false,
      queryExtensionResult: {
        llmModel: 'gpt-query',
        requestId: 'req_query_extension',
        seconds: 1.2,
        inputTokens: 10,
        outputTokens: 5,
        usedUserOpenAIKey: true,
        embeddingModel: 'embedding-query',
        embeddingTokens: 6,
        query: 'origin\nexpanded'
      }
    });

    const result = await dispatchDatasetSearch({
      runningAppInfo: { teamId: 'team_1' },
      runningUserInfo: { tmbId: 'tmb_1' },
      externalProvider: {
        openaiAccount: {
          key: 'user-key'
        }
      },
      histories: [],
      node: { name: 'Dataset Search' },
      params: {
        datasets: [{ datasetId: 'dataset_1' }],
        similarity: 0.4,
        limit: 5000,
        userChatInput: 'origin',
        authTmbId: false,
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.5,
        usingReRank: false,
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: true
      },
      nodeSummary: createNodeSummary(),
      usagePush: usagePushMock
    } as any);

    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(nodeResponse?.childrenResponses?.[0]).toMatchObject({
      totalPoints: 0,
      llmRequestIds: ['req_query_extension']
    });
    expect(usagePushMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'common:core.module.template.Query extension',
          totalPoints: 0
        }),
        expect.objectContaining({
          moduleName: 'account_usage:ai.query_extension_embedding',
          totalPoints: 0.06
        })
      ])
    );
  });

  it('adds image caption request ids and skips platform points when external OpenAI key is used', async () => {
    const userKey = { key: 'user-key', baseUrl: 'https://api.example.com/v1' };
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 20,
      reRankInputTokens: 0,
      usingSimilarityFilter: true,
      usingReRank: false,
      imageCaptionResult: {
        model: 'gpt-vision',
        inputTokens: 4,
        outputTokens: 3,
        requestIds: ['req_image_caption_1', 'req_image_caption_2'],
        seconds: 1.5,
        usedUserOpenAIKey: true,
        queries: ['red handbag', 'blue sneaker']
      }
    });

    const result = await dispatchDatasetSearch({
      runningAppInfo: { teamId: 'team_1' },
      runningUserInfo: { tmbId: 'tmb_1' },
      externalProvider: {
        openaiAccount: userKey
      },
      histories: [],
      node: { name: 'Dataset Search' },
      params: {
        datasets: [{ datasetId: 'dataset_1' }],
        similarity: 0.4,
        limit: 5000,
        userChatInput: '',
        datasetSearchInput: ['https://files.example.com/query.png'],
        authTmbId: false,
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.5,
        usingReRank: false,
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: false
      },
      nodeSummary: createNodeSummary(),
      usagePush: usagePushMock
    } as any);

    expect(defaultSearchDatasetDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userKey,
        imageQueries: ['https://files.example.com/query.png']
      })
    );

    const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];
    expect(nodeResponse?.childrenResponses?.[0]).toMatchObject({
      id: 'req_image_caption_1',
      nodeId: 'req_image_caption_1',
      moduleType: FlowNodeTypeEnum.datasetSearchNode,
      moduleName: 'chat:image_parse',
      moduleLogo: 'core/workflow/template/datasetSearch',
      runningTime: 1.5,
      model: 'gpt-vision name',
      llmRequestIds: ['req_image_caption_1', 'req_image_caption_2'],
      inputTokens: 4,
      outputTokens: 3,
      totalPoints: 0,
      textOutput: 'red handbag\nblue sneaker'
    });
    expect(usagePushMock).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          moduleName: 'account_usage:image_parse',
          totalPoints: 0
        })
      ])
    );
  });

  it('uses default recall for image-only input even when deep search is enabled', async () => {
    defaultSearchDatasetDataMock.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 4,
      reRankInputTokens: 0,
      usingSimilarityFilter: false,
      usingReRank: false
    });

    const result = await dispatchDatasetSearch({
      runningAppInfo: { teamId: 'team_1' },
      runningUserInfo: { tmbId: 'tmb_1' },
      externalProvider: {},
      histories: [],
      node: { name: 'Dataset Search' },
      params: {
        datasets: [{ datasetId: 'dataset_1' }],
        similarity: 0.4,
        limit: 5000,
        userChatInput: '',
        datasetSearchInput: ['https://files.example.com/query.png'],
        authTmbId: false,
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 0.5,
        usingReRank: false,
        rerankWeight: 0.5,
        datasetSearchUsingExtensionQuery: false,
        datasetDeepSearch: true
      },
      nodeSummary: createNodeSummary(),
      usagePush: usagePushMock
    } as any);

    expect(deepRagSearchMock).not.toHaveBeenCalled();
    expect(defaultSearchDatasetDataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        textQueries: [],
        imageQueries: ['https://files.example.com/query.png']
      })
    );
    expect(result[DispatchNodeResponseKeyEnum.nodeResponse]?.datasetQueries).toEqual([
      'https://files.example.com/query.png'
    ]);
  });

  describe('retrievalResults', () => {
    const recalled = [
      { id: 'recall_1', q: 'q1', a: 'a1', sourceName: 'doc1.md' },
      { id: 'recall_2', q: 'q2', a: 'a2', sourceName: 'doc2.md' }
    ];
    const reranked = [{ id: 'recall_2', q: 'q2', a: 'a2', sourceName: 'doc2.md' }];

    // searchUsingReRank 为 true 时计费分支会读取 rerankModelData，必须配置。
    const useRerankModel = async () => {
      vi.mocked((await modelGetters.getSystemModelHandle()).getRerankModelData).mockReturnValue({
        modelId: 'rerank-model',
        model: 'rerank-model',
        name: 'Rerank Model',
        type: 'rerank',
        config: {}
      } as any);
    };

    it('keeps the pre-rerank candidates when rerank is on', async () => {
      await useRerankModel();
      defaultSearchDatasetDataMock.mockResolvedValue({
        searchRes: reranked,
        retrievalResults: recalled,
        embeddingTokens: 10,
        reRankInputTokens: 5,
        usingSimilarityFilter: false,
        usingReRank: true
      });

      const result = await runSearch({ usingReRank: true });
      const nodeResponse = result[DispatchNodeResponseKeyEnum.nodeResponse];

      expect(nodeResponse?.retrievalResults?.map((item) => item.id)).toEqual([
        'recall_1',
        'recall_2'
      ]);
      // quoteList 仍是重排后的列表
      expect(nodeResponse?.quoteList?.map((item) => item.id)).toEqual(['recall_2']);
    });

    it('records whatever the recall layer produced, the layer owns the rerank gate', async () => {
      // 是否产出由检索层按 usingReRank 决定，dispatcher 只负责原样记录。
      defaultSearchDatasetDataMock.mockResolvedValue({
        searchRes: recalled,
        retrievalResults: recalled,
        embeddingTokens: 10,
        reRankInputTokens: 0,
        usingSimilarityFilter: false,
        usingReRank: false
      });

      const result = await runSearch({ usingReRank: false });

      expect(
        result[DispatchNodeResponseKeyEnum.nodeResponse]?.retrievalResults?.map((item) => item.id)
      ).toEqual(['recall_1', 'recall_2']);
    });

    it('omits the field when the recall layer produced nothing', async () => {
      // 重排关闭或 RETRIEVAL_RESULTS_LIMIT=0 时检索层不产出该字段。
      await useRerankModel();
      defaultSearchDatasetDataMock.mockResolvedValue({
        searchRes: reranked,
        embeddingTokens: 10,
        reRankInputTokens: 5,
        usingSimilarityFilter: false,
        usingReRank: true
      });

      const result = await runSearch({ usingReRank: true });

      expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).not.toHaveProperty(
        'retrievalResults'
      );
    });

    it('omits the field on the deep search path, which does not produce it', async () => {
      await useRerankModel();
      deepRagSearchMock.mockResolvedValue({
        searchRes: reranked,
        embeddingTokens: 10,
        reRankInputTokens: 5,
        usingSimilarityFilter: false,
        usingReRank: true
      });

      const result = await runSearch({ usingReRank: true, datasetDeepSearch: true });
      expect(deepRagSearchMock).toHaveBeenCalled();

      expect(result[DispatchNodeResponseKeyEnum.nodeResponse]).not.toHaveProperty(
        'retrievalResults'
      );
    });
  });

  it('downgrades workflow resource errors without changing the node response', async () => {
    const error = new WorkflowResourceError('App resource is unavailable: dataset:deleted_id');
    loadWorkflowDatasetResourceMock.mockRejectedValueOnce(error);
    const result = await runSearch();
    expect(result).toMatchObject({
      error: { [NodeOutputKeyEnum.errorText]: error.message },
      [DispatchNodeResponseKeyEnum.nodeResponse]: { errorText: error.message },
      [DispatchNodeResponseKeyEnum.toolResponse]: { error: error.message }
    });
    expect(mockLogger.warn).toHaveBeenCalledWith('Dataset search dispatch failed', { error });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('downgrades log to warn when dataset is missing (unExistDataset)', async () => {
    findDatasetMock.mockReturnValueOnce({ lean: vi.fn().mockResolvedValue([]) });
    const result = await runSnapshotSearch();
    expect(result.error).toBeDefined();
    expect(mockLogger.warn).toHaveBeenCalledWith('Dataset search dispatch failed', {
      error: DatasetErrEnum.unExist
    });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('retains logger.error when the dataset database query fails', async () => {
    const error = new Error('Mongo connection timed out');
    findDatasetMock.mockReturnValueOnce({ lean: vi.fn().mockRejectedValue(error) });
    const result = await runSnapshotSearch();
    expect(result.error).toEqual({ [NodeOutputKeyEnum.errorText]: error.message });
    expect(mockLogger.error).toHaveBeenCalledWith('Dataset search dispatch failed', { error });
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});

describe('isDatasetResourceMissingError', () => {
  it('identifies WorkflowResourceError as missing resource error', () => {
    expect(
      isDatasetResourceMissingError(
        new WorkflowResourceError('App resource is not declared: dataset:123')
      )
    ).toBe(true);
    expect(
      isDatasetResourceMissingError(
        new WorkflowResourceError('App resource is unavailable: dataset:123')
      )
    ).toBe(true);
  });

  it('identifies unExistDataset as missing resource error', () => {
    expect(isDatasetResourceMissingError(DatasetErrEnum.unExist)).toBe(true);
    expect(isDatasetResourceMissingError(new UserError(DatasetErrEnum.unExist))).toBe(true);
    expect(isDatasetResourceMissingError({ message: DatasetErrEnum.unExist })).toBe(true);
    expect(isDatasetResourceMissingError({ statusText: DatasetErrEnum.unExist })).toBe(true);
  });

  it('does not match unexpected system errors', () => {
    expect(isDatasetResourceMissingError(new Error('Database timeout'))).toBe(false);
    expect(isDatasetResourceMissingError(new Error('Cannot read properties of undefined'))).toBe(
      false
    );
    expect(isDatasetResourceMissingError(null)).toBe(false);
    expect(isDatasetResourceMissingError(undefined)).toBe(false);
    expect(isDatasetResourceMissingError({})).toBe(false);
  });
});
