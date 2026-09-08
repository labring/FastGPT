import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import * as modelGetters from '../../../../../core/ai/model';

const {
  defaultSearchDatasetDataMock,
  deepRagSearchMock,
  findDatasetByIdMock,
  getDatasetSearchVlmModelMock,
  formatModelChars2PointsMock,
  usagePushMock
} = vi.hoisted(() => ({
  defaultSearchDatasetDataMock: vi.fn(),
  deepRagSearchMock: vi.fn(),
  findDatasetByIdMock: vi.fn(),
  getDatasetSearchVlmModelMock: vi.fn(),
  formatModelChars2PointsMock: vi.fn(),
  usagePushMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/search', () => ({
  defaultSearchDatasetData: defaultSearchDatasetDataMock,
  deepRagSearch: deepRagSearchMock
}));

vi.mock('@fastgpt/service/core/dataset/search/vlm', () => ({
  getDatasetSearchVlmModel: getDatasetSearchVlmModelMock
}));

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  DatasetCollectionName: 'datasets',
  MongoDataset: {
    findById: findDatasetByIdMock
  }
}));

vi.mock('@fastgpt/service/core/dataset/utils', () => ({
  filterDatasetsByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getDefaultLLMModelData: vi.fn(),
  getDefaultRerankModelData: vi.fn(),
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
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: formatModelChars2PointsMock
}));

import { dispatchDatasetSearch } from '../../../../../core/workflow/dispatch/dataset/search';

describe('dispatchDatasetSearch', () => {
  const runSearch = (params: Record<string, unknown> = {}) =>
    dispatchDatasetSearch({
      runningAppInfo: { teamId: 'team_1' },
      runningUserInfo: { tmbId: 'tmb_1' },
      externalProvider: {},
      histories: [],
      node: { name: 'Dataset Search' },
      params: { datasets: [{ datasetId: 'dataset_1' }], userChatInput: 'question', ...params },
      usagePush: usagePushMock
    } as any);

  it('executes and bills the fallback auxiliary models when configured models are unavailable', async () => {
    vi.mocked(modelGetters.getLLMModelData).mockImplementationOnce(() => {
      throw new UserError(ModelErrEnum.unExist);
    });
    vi.mocked(modelGetters.getRerankModelData).mockImplementationOnce(() => {
      throw new UserError(ModelErrEnum.unConfigured);
    });
    vi.mocked(modelGetters.getDefaultLLMModelData).mockReturnValueOnce({
      modelId: 'fallback-llm',
      model: 'fallback-llm',
      name: 'Fallback LLM',
      type: 'llm',
      config: {}
    } as any);
    vi.mocked(modelGetters.getDefaultRerankModelData).mockReturnValueOnce({
      modelId: 'fallback-rerank',
      model: 'fallback-rerank',
      name: 'Fallback Rerank',
      type: 'rerank',
      config: {}
    } as any);
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
    const result = await runSearch({
      usingReRank: true,
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModelId: 'deleted'
    });
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
    vi.mocked(modelGetters.getEmbeddingModelData).mockImplementationOnce(() => {
      throw new UserError(ModelErrEnum.unExist);
    });
    const result = await runSearch({ usingReRank: true, datasetSearchUsingExtensionQuery: true });
    expect(result.error).toBeDefined();
    expect(defaultSearchDatasetDataMock).not.toHaveBeenCalled();
    expect(modelGetters.getDefaultLLMModelData).not.toHaveBeenCalled();
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
    findDatasetByIdMock.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        vectorModel: 'embedding-model',
        vlmModel: 'gpt-vision'
      })
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
      usagePush: usagePushMock
    } as any);
    expect(getDatasetSearchVlmModelMock).toHaveBeenCalledWith({
      teamId: 'team_1',
      datasetIds: ['first', 'second']
    });
    expect(defaultSearchDatasetDataMock).toHaveBeenCalledWith(
      expect.objectContaining({ vlmModel: undefined })
    );
    expect(result.error).toBeUndefined();
    expect(result.data?.quoteQA).toEqual([]);
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
});
