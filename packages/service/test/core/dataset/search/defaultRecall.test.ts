import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum, SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { FullTextSearchProps } from '@fastgpt/service/common/vectorDB/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { serviceEnv } from '@fastgpt/service/env';

const mockGetVectors = vi.hoisted(() => vi.fn());
const mockRecallFromVectorStore = vi.hoisted(() => vi.fn());
const mockCreateLLMResponse = vi.hoisted(() => vi.fn());
const mockReRankRecall = vi.hoisted(() => vi.fn());
const mockMongoDatasetCollectionFind = vi.hoisted(() => vi.fn());
const mockMongoDatasetDataFind = vi.hoisted(() => vi.fn());
const mockSearchSqlFullText = vi.hoisted(() => vi.fn());
const mockGetImageBase64 = vi.hoisted(() => vi.fn());
// ISSUE-015:getFullTextStore 为可切换 mock。mockUseMilvusStore 为独立开关(默认 false),
// milvus 用例置 true 后经 mockFullTextStoreSearch 覆盖,不走 SQL 原生全文检索。
const mockFullTextStoreSearch = vi.hoisted(() => vi.fn());
const mockUseMilvusStore = vi.hoisted(() => ({ value: false }));
const mockCountPromptTokens = vi.hoisted(() => vi.fn(async (prompt: string) => prompt.length));
const mockCountPromptTokensBatch = vi.hoisted(() =>
  vi.fn(async (prompts: string[]) => prompts.map((prompt) => prompt.length))
);
const mockCreateS3DownloadAccessUrls = vi.hoisted(() =>
  vi.fn(async (params: Array<{ objectKey: string }>) =>
    params.map(({ objectKey }) => `https://files.test/${objectKey}`)
  )
);

const originalMultipleDataToBase64 = serviceEnv.MULTIPLE_DATA_TO_BASE64;

const embeddingModel = {
  modelId: '507f1f77bcf86cd799439017',
  provider: 'openai',
  model: 'mock-embedding-model',
  name: 'Mock Embedding Model',
  type: ModelTypeEnum.embedding,
  scope: 'system' as const,
  isActive: true,
  config: {
    defaultToken: 100,
    maxToken: 100,
    weight: 0,
    vision: false
  }
};

const vlmModel = {
  modelId: '507f1f77bcf86cd799439018',
  provider: 'openai',
  model: 'mock-vlm-model',
  name: 'Mock VLM Model',
  type: ModelTypeEnum.llm,
  scope: 'system' as const,
  isActive: true,
  config: {
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 30000,
    vision: true
  }
};

vi.mock('@fastgpt/service/core/dataset/vectorData/service', () => ({
  getDatasetVectorSearchData: vi.fn(async () => undefined)
}));

vi.mock('@fastgpt/service/core/ai/embedding', () => ({
  getVectors: mockGetVectors
}));

vi.mock('@fastgpt/service/common/vectorDB/controller', () => ({
  recallFromVectorStore: mockRecallFromVectorStore
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: mockCreateLLMResponse
}));

// reRankSearchResults 会把 rerank 异常吞成 usingReRank:false，不 mock 就无法走到「重排生效」分支。
vi.mock('@fastgpt/service/core/ai/rerank', () => ({
  reRankRecall: mockReRankRecall
}));

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBase64: mockGetImageBase64,
  addEndpointToImageUrl: (text: string) => text
}));

vi.mock('@fastgpt/service/common/s3/accessLink', () => ({
  createS3DownloadAccessUrls: mockCreateS3DownloadAccessUrls
}));

// defaultRecall 的结果过滤只关心 token 数的相对大小，测试里用稳定 mock
// 隔离真实 worker 路径，避免单元测试依赖 app/pro 的 worker 构建产物。
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countPromptTokens: mockCountPromptTokens,
  countPromptTokensBatch: mockCountPromptTokensBatch
}));

vi.mock('@fastgpt/service/core/dataset/collection/schema', () => ({
  DatasetColCollectionName: 'dataset_collections',
  MongoDatasetCollection: {
    find: mockMongoDatasetCollectionFind
  }
}));

vi.mock('@fastgpt/service/core/dataset/data/schema', () => ({
  DatasetDataCollectionName: 'dataset_datas',
  MongoDatasetData: {
    find: mockMongoDatasetDataFind
  }
}));

vi.mock('@fastgpt/service/core/dataset/fullText/sql/store', () => ({
  searchSqlFullText: mockSearchSqlFullText,
  isSqlFullTextTargetReady: vi.fn(async () => true)
}));

// 覆盖 test/mocks/common/vector.ts 的全局 constants mock(其缺 getVectorType 导出)。
// textStore 经 importOriginal 委托真实 SqlFullTextStore 时需要该导出;defaultRecall 链路本身
// 不消费 vectorDB/constants,因此补上导出不影响既有用例。
vi.mock('@fastgpt/service/common/vectorDB/constants', async (importOriginal) => {
  const orig = await importOriginal<typeof import('@fastgpt/service/common/vectorDB/constants')>();
  return {
    ...orig,
    MILVUS_ADDRESS: 'http://localhost:19530',
    getVectorType: () => 'pg'
  };
});

// getFullTextStore 可切换 mock(ISSUE-015):
// 默认(mockUseMilvusStore.value=false)委托真实 SqlFullTextStore.search —— 内部走
// searchSqlFullText,由 mockSearchSqlFullText 支撑;
// milvus 用例置 mockUseMilvusStore.value=true 后经 mockFullTextStoreSearch 覆盖。
vi.mock('@fastgpt/service/core/dataset/data/textStore', async (importOriginal) => {
  const orig =
    await importOriginal<typeof import('@fastgpt/service/core/dataset/data/textStore')>();
  return {
    ...orig,
    getFullTextStore: () => ({
      search: async (props: FullTextSearchProps) => {
        if (mockUseMilvusStore.value) {
          return mockFullTextStoreSearch(props);
        }
        return new orig.SqlFullTextStore().search(props);
      }
    })
  };
});

import { searchDatasetData } from '../../../../core/dataset/search/defaultRecall';
import { reRankSearchResults } from '../../../../core/dataset/search/defaultRecall/rerank';
import { filterSearchResultsByScore } from '../../../../core/dataset/search/defaultRecall/result';
import { fullTextRecall } from '../../../../core/dataset/search/defaultRecall/fullTextRecall';

afterEach(() => {
  serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
});

describe('default recall dataset search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 重置 getFullTextStore 可切换 mock(ISSUE-015):默认走 mongo 委托,避免 milvus 用例污染
    mockUseMilvusStore.value = false;
    mockFullTextStoreSearch.mockReset();
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
    mockCountPromptTokensBatch.mockImplementation(async (prompts: string[]) =>
      prompts.map((prompt) => prompt.length)
    );
    mockCountPromptTokens.mockImplementation(async (prompt: string) => prompt.length);

    embeddingModel.config.vision = false;
    mockGetVectors.mockResolvedValue({
      tokens: 10,
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4]
      ]
    });
    mockRecallFromVectorStore.mockResolvedValue({
      results: []
    });
    mockMongoDatasetCollectionFind.mockImplementation((query: Record<string, any>) => {
      if (query?.forbid) return { lean: vi.fn().mockResolvedValue([]) };
      return {
        lean: vi.fn().mockResolvedValue([])
      };
    });
    mockMongoDatasetDataFind.mockReturnValue({
      select: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      }),
      lean: vi.fn().mockResolvedValue([])
    });
    mockSearchSqlFullText.mockResolvedValue([]);
  });

  it('should ignore failed image caption and continue dataset search', async () => {
    const userKey = { key: 'user-key', baseUrl: 'https://api.example.com/v1' };
    mockCreateLLMResponse.mockRejectedValueOnce(new Error('vlm failed')).mockResolvedValueOnce({
      requestId: 'req_image_caption_2',
      answerText: 'red handbag on a white table',
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        usedUserOpenAIKey: true
      }
    });

    const result = await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: embeddingModel,
      vlmModel,
      datasetIds: ['dataset-1'],
      reRankQuery: 'black high heels',
      textQueries: ['black high heels'],
      imageQueries: ['data:image/png;base64,broken-image', 'data:image/png;base64,current-image'],
      userKey,
      limit: 5000,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(result.imageCaptionResult).toEqual({
      model: 'mock-vlm-model',
      inputTokens: 3,
      outputTokens: 2,
      requestIds: ['req_image_caption_2'],
      seconds: expect.any(Number),
      usedUserOpenAIKey: true,
      queries: ['red handbag on a white table']
    });
    expect(mockGetVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          {
            type: 'text',
            input: 'black high heels'
          },
          {
            type: 'text',
            input: 'red handbag on a white table'
          }
        ]
      })
    );
    expect(mockCreateLLMResponse.mock.calls[1][0].body.messages[0].content[0].image_url.url).toBe(
      'data:image/png;base64,current-image'
    );
    expect(mockCreateLLMResponse.mock.calls[1][0].userKey).toBe(userKey);
    expect(result.searchRes).toEqual([]);
  });

  it('should request text and image embeddings in one getVectors call', async () => {
    embeddingModel.config.vision = true;
    mockGetVectors.mockResolvedValueOnce({
      tokens: 12,
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4]
      ]
    });

    await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: embeddingModel,
      datasetIds: ['dataset-1'],
      reRankQuery: 'black high heels',
      textQueries: ['black high heels'],
      imageQueries: ['data:image/png;base64,current-image'],
      limit: 5000,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(mockGetVectors).toHaveBeenCalledTimes(1);
    expect(mockGetVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          {
            type: 'text',
            input: 'black high heels'
          },
          {
            type: 'image',
            input: 'data:image/png;base64,current-image'
          }
        ]
      })
    );
    expect(mockGetImageBase64).not.toHaveBeenCalledWith('   ');
  });

  it('should skip blank embedding recall inputs while preserving valid task order', async () => {
    embeddingModel.config.vision = true;
    mockGetVectors.mockResolvedValueOnce({
      tokens: 12,
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4]
      ]
    });

    await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: embeddingModel,
      datasetIds: ['dataset-1'],
      reRankQuery: 'black high heels',
      textQueries: ['   ', ' black high heels '],
      imageQueries: ['   ', 'data:image/png;base64,current-image'],
      limit: 5000,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(mockGetVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          {
            type: 'text',
            input: 'black high heels'
          },
          {
            type: 'image',
            input: 'data:image/png;base64,current-image'
          }
        ]
      })
    );
  });

  it('should pass overlong text queries to centralized embedding fallback without creating extra queries', async () => {
    embeddingModel.config.vision = false;
    const smallEmbeddingModel = {
      ...embeddingModel,
      config: { ...embeddingModel.config, maxToken: 12 }
    };
    mockGetVectors.mockImplementationOnce(async ({ inputs }) => ({
      tokens: 10,
      vectors: inputs.map((_: unknown, index: number) => [index + 1])
    }));

    await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: smallEmbeddingModel,
      datasetIds: ['dataset-1'],
      reRankQuery: 'abcdefghijklmnopqrstuvwxy',
      textQueries: ['abcdefghijklmnopqrstuvwxy'],
      imageQueries: [],
      limit: 5000,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(mockGetVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          {
            type: 'text',
            input: 'abcdefghijklmnopqrstuvwxy'
          }
        ]
      })
    );
  });

  it('should ignore failed image embedding normalization and keep text recall', async () => {
    embeddingModel.config.vision = true;
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = true;
    mockGetImageBase64.mockRejectedValueOnce(new Error('expired image'));
    mockGetVectors.mockResolvedValueOnce({
      tokens: 12,
      vectors: [
        [0.1, 0.2],
        [0.3, 0.4]
      ]
    });

    await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: embeddingModel,
      datasetIds: ['dataset-1'],
      reRankQuery: 'black high heels',
      textQueries: ['black high heels'],
      imageQueries: [
        'https://file.fastgpt.io/temp/team-1/expired.png?token=mock',
        'data:image/png;base64,current-image'
      ],
      limit: 5000,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(mockGetVectors).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          {
            type: 'text',
            input: 'black high heels'
          },
          {
            type: 'image',
            input: 'data:image/png;base64,current-image'
          }
        ]
      })
    );
  });

  it('should skip blank full-text queries before full-text store search', async () => {
    embeddingModel.config.vision = false;

    const result = await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: embeddingModel,
      datasetIds: ['dataset-1'],
      reRankQuery: '',
      textQueries: ['   ', '\n'],
      imageQueries: [],
      limit: 5000,
      searchMode: DatasetSearchModeEnum.fullTextRecall,
      embeddingWeight: 0.5,
      usingReRank: false
    });

    expect(mockGetVectors).not.toHaveBeenCalled();
    expect(mockSearchSqlFullText).not.toHaveBeenCalled();
    expect(result.searchRes).toEqual([]);
  });

  it('should only batch-sign authorized dataset S3 keys from results that survive score filtering', async () => {
    embeddingModel.config.vision = false;
    mockGetVectors.mockResolvedValueOnce({
      tokens: 5,
      vectors: [[0.1, 0.2]]
    });
    mockRecallFromVectorStore.mockResolvedValueOnce({
      results: [
        { id: 'index-keep', collectionId: 'collection-1', score: 0.9 },
        { id: 'index-filtered', collectionId: 'collection-1', score: 0.1 }
      ]
    });
    mockMongoDatasetCollectionFind.mockImplementation((query: Record<string, any>) => {
      if (query?.forbid) return { lean: vi.fn().mockResolvedValue([]) };
      return {
        lean: vi.fn().mockResolvedValue([{ _id: 'collection-1', name: 'Source' }])
      };
    });
    // 命中结果同时内嵌本库 key 与外库 key：只有归属于召回 datasetIds 的 key 才签发短链。
    mockMongoDatasetDataFind.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'data-keep',
          datasetId: 'dataset-1',
          collectionId: 'collection-1',
          updateTime: new Date('2026-01-01'),
          q: 'Keep ![image](dataset/dataset-1/keep.png) leak ![image](dataset/foreign-dataset/secret.png)',
          a: '',
          chunkIndex: 0,
          indexes: [{ dataId: 'index-keep' }]
        },
        {
          _id: 'data-filtered',
          datasetId: 'dataset-1',
          collectionId: 'collection-1',
          updateTime: new Date('2026-01-01'),
          q: 'Filtered ![image](dataset/dataset-1/filtered.png)',
          a: '',
          chunkIndex: 1,
          indexes: [{ dataId: 'index-filtered' }]
        }
      ])
    });

    const result = await searchDatasetData({
      histories: [],
      teamId: 'team-1',
      model: embeddingModel,
      datasetIds: ['dataset-1'],
      reRankQuery: 'query',
      textQueries: ['query'],
      limit: 5000,
      similarity: 0.5,
      searchMode: DatasetSearchModeEnum.embedding,
      usingReRank: false
    });

    expect(result.searchRes).toHaveLength(1);
    // 本库 key 被签发为短链，外库 key 保持原文本不替换
    expect(result.searchRes[0]?.q).toContain('https://files.test/dataset/dataset-1/keep.png');
    expect(result.searchRes[0]?.q).toContain('dataset/foreign-dataset/secret.png');
    // 被相似度过滤的候选不产生任何 alias 查询
    expect(mockCreateS3DownloadAccessUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateS3DownloadAccessUrls.mock.calls[0][0].map((item) => item.objectKey)).toEqual([
      'dataset/dataset-1/keep.png'
    ]);
  });

  describe('retrievalResults 快照产出条件', () => {
    const rerankModel = {
      modelId: 'rerank-model',
      provider: 'openai',
      model: 'rerank-model',
      name: 'Rerank Model',
      type: ModelTypeEnum.rerank,
      scope: 'system' as const,
      isActive: true,
      config: {}
    };

    // 一条 text query 对应一个向量，向量召回返回两条候选，rerank 命中其中一条，
    // 制造「候选集 != 最终结果」的场景。
    const arrangeTwoCandidates = () => {
      embeddingModel.config.vision = false;
      mockGetVectors.mockResolvedValue({
        tokens: 5,
        vectors: [[0.1, 0.2]]
      });
      mockRecallFromVectorStore.mockResolvedValue({
        results: [
          { id: 'index-a', collectionId: 'collection-1', score: 0.9 },
          { id: 'index-b', collectionId: 'collection-1', score: 0.8 }
        ]
      });
      mockMongoDatasetCollectionFind.mockImplementation((query: Record<string, any>) => {
        if (query?.forbid) return { lean: vi.fn().mockResolvedValue([]) };
        return { lean: vi.fn().mockResolvedValue([{ _id: 'collection-1', name: 'Source' }]) };
      });
      mockMongoDatasetDataFind.mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            _id: 'data-a',
            teamId: 'team-1',
            datasetId: 'dataset-1',
            collectionId: 'collection-1',
            updateTime: new Date('2026-01-01'),
            q: 'A',
            a: 'alpha',
            chunkIndex: 0,
            indexes: [{ dataId: 'index-a' }]
          },
          {
            _id: 'data-b',
            teamId: 'team-1',
            datasetId: 'dataset-1',
            collectionId: 'collection-1',
            updateTime: new Date('2026-01-01'),
            q: 'B',
            a: 'beta',
            chunkIndex: 1,
            indexes: [{ dataId: 'index-b' }]
          }
        ])
      });
      // rerank 只保留 data-a
      mockReRankRecall.mockResolvedValue({
        results: [{ id: 'data-a', score: 0.99 }],
        inputTokens: 7
      });
    };

    const runSearch = (params: Record<string, unknown> = {}) =>
      searchDatasetData({
        histories: [],
        teamId: 'team-1',
        model: embeddingModel,
        datasetIds: ['dataset-1'],
        reRankQuery: 'query',
        textQueries: ['query'],
        limit: 5000,
        searchMode: DatasetSearchModeEnum.embedding,
        embeddingWeight: 1,
        rerankModel: rerankModel as any,
        ...params
      });

    const originalLimit = serviceEnv.RETRIEVAL_RESULTS_LIMIT;
    const originalSynonymEnabled = serviceEnv.DATASET_SYNONYM_ENABLED;
    afterEach(() => {
      serviceEnv.RETRIEVAL_RESULTS_LIMIT = originalLimit;
      serviceEnv.DATASET_SYNONYM_ENABLED = originalSynonymEnabled;
    });

    it('重排生效时产出重排前的召回快照，含被重排淘汰的候选，且同义词只装饰最终结果', async () => {
      arrangeTwoCandidates();
      serviceEnv.RETRIEVAL_RESULTS_LIMIT = 20;
      serviceEnv.DATASET_SYNONYM_ENABLED = true;

      const result = await runSearch({ usingReRank: true, rerankWeight: 1 });

      expect(result.usingReRank).toBe(true);
      expect(mockReRankRecall).toHaveBeenCalled();
      // quoteList / searchRes 是重排后的结果，只剩 data-a，且携带同义词装饰
      expect(result.searchRes.map((item) => item.id)).toEqual(['data-a']);
      expect(result.searchRes[0]?.synonymMappings).toEqual({});
      // 快照取自重排前的 textRecallResults，被重排淘汰的 data-b 仍在其中，且不携带同义词装饰
      expect(result.retrievalResults?.map((item) => item.id).sort()).toEqual(['data-a', 'data-b']);
      expect(result.retrievalResults?.every((item) => item.synonymMappings === undefined)).toBe(
        true
      );
    });

    it('为召回候选写入 retrievalRank，重排后最终结果仍可回溯召回位置', async () => {
      arrangeTwoCandidates();
      serviceEnv.RETRIEVAL_RESULTS_LIMIT = 20;

      const result = await runSearch({ usingReRank: true, rerankWeight: 1 });

      // 快照顺序即重排前召回顺序，retrievalRank 从 0 起
      expect(result.retrievalResults?.map((item) => [item.id, item.retrievalRank])).toEqual([
        ['data-a', 0],
        ['data-b', 1]
      ]);
      // 重排淘汰 data-b，但保留的 data-a 仍能回溯到召回位置
      expect(result.searchRes.map((item) => [item.id, item.retrievalRank])).toEqual([
        ['data-a', 0]
      ]);
    });

    it('重排未生效时不产出候选集，避免占用内存又最终不用', async () => {
      arrangeTwoCandidates();
      serviceEnv.RETRIEVAL_RESULTS_LIMIT = 20;

      const result = await runSearch({ usingReRank: false });

      expect(result.usingReRank).toBe(false);
      expect(result.retrievalResults).toBeUndefined();
      // 未开重排时没有多余开销：rerank 未被调用
      expect(mockReRankRecall).not.toHaveBeenCalled();
    });

    it('重排请求但 rerank 模型缺失时不产出候选集', async () => {
      arrangeTwoCandidates();
      serviceEnv.RETRIEVAL_RESULTS_LIMIT = 20;

      const result = await runSearch({ usingReRank: true, rerankModel: undefined });

      // 无模型时 usingReRank 意图即为 false，不会走重排也不会产出快照
      expect(result.usingReRank).toBe(false);
      expect(result.retrievalResults).toBeUndefined();
      expect(mockReRankRecall).not.toHaveBeenCalled();
    });

    it('RETRIEVAL_RESULTS_LIMIT 为 0 时不产出候选集', async () => {
      arrangeTwoCandidates();
      serviceEnv.RETRIEVAL_RESULTS_LIMIT = 0;

      const result = await runSearch({ usingReRank: true, rerankWeight: 1 });

      expect(result.usingReRank).toBe(true);
      expect(result.retrievalResults).toBeUndefined();
    });

    it('候选数超过上限时按上限截断', async () => {
      arrangeTwoCandidates();
      serviceEnv.RETRIEVAL_RESULTS_LIMIT = 1;

      const result = await runSearch({ usingReRank: true, rerankWeight: 1 });

      expect(result.retrievalResults).toHaveLength(1);
    });
  });
});

describe('fullTextRecall engine dispatch', () => {
  beforeEach(() => {
    // 每个用例独立:清空所有 mock 调用、重置 store 开关为 SQL 委托、默认返回空
    vi.clearAllMocks();
    mockUseMilvusStore.value = false;
    mockFullTextStoreSearch.mockReset();
    mockSearchSqlFullText.mockResolvedValue([]);
  });

  it('TC-13.1 SQL path groups results assembled via store search', async () => {
    // 被测函数: fullTextRecall  等级: 3-High
    // 正常场景(回归): getFullTextStore 默认委托真实 SqlFullTextStore.search(内部走 searchSqlFullText,
    // 由 mockSearchSqlFullText 支撑),buildResultsFromRecallItems 反查 data/collection 组装;
    // 结果 id 取自 dataset_data._id。
    mockSearchSqlFullText.mockResolvedValue([
      { dataId: '68ad85a7463006c963799a05', collectionId: 'col1', score: 2.5 }
    ]);
    mockMongoDatasetDataFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: '68ad85a7463006c963799a05',
          datasetId: '68ad85a7463006c963799a05',
          collectionId: 'col1',
          updateTime: new Date('2026-01-01'),
          q: '苹果',
          a: '一种水果',
          imageId: 'img1',
          chunkIndex: 0,
          indexes: [{ dataId: 'idx1' }]
        }
      ])
    });
    mockMongoDatasetCollectionFind.mockImplementation((query: Record<string, any>) => {
      if (query?.forbid) return { lean: vi.fn().mockResolvedValue([]) };
      return {
        lean: vi.fn().mockResolvedValue([{ _id: 'col1', name: 'Source' }])
      };
    });

    const res = await fullTextRecall({
      teamId: '68ad85a7463006c963799a05',
      datasetIds: ['68ad85a7463006c963799a05'],
      queryGroups: [{ source: 'text', queries: ['苹果'] }],
      limit: 10,
      forbidCollectionIdList: []
    });

    expect(mockSearchSqlFullText).toHaveBeenCalled();
    expect(res.textFullTextRecallResults[0].id).toBe('68ad85a7463006c963799a05');
    expect(res.textFullTextRecallResults[0].score).toEqual([
      { type: SearchScoreTypeEnum.fullText, value: 2.5, index: 0 }
    ]);
  });

  it('TC-13.2 milvus path assembles via store dispatch without querying SQL full-text store', async () => {
    // 被测函数: fullTextRecall  等级: 3-High
    // 正常场景: getFullTextStore 返回 milvus 实现,mockFullTextStoreSearch 返回 FullTextSearchItem[],
    // buildResultsFromRecallItems 组装结果且不查 SQL full-text store。
    mockUseMilvusStore.value = true;
    mockFullTextStoreSearch.mockReturnValue([
      { dataId: '68ad85a7463006c963799a05', collectionId: 'col1', score: 0.9 }
    ]);
    mockMongoDatasetDataFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: '68ad85a7463006c963799a05',
          datasetId: 'd',
          collectionId: 'col1',
          updateTime: new Date('2026-01-01'),
          q: '苹果',
          a: '一种水果',
          imageId: 'img1',
          chunkIndex: 0,
          indexes: [{ dataId: 'idx1' }]
        }
      ])
    });
    mockMongoDatasetCollectionFind.mockImplementation((query: Record<string, any>) => {
      if (query?.forbid) return { lean: vi.fn().mockResolvedValue([]) };
      return {
        lean: vi.fn().mockResolvedValue([{ _id: 'col1', name: 'Source' }])
      };
    });

    const res = await fullTextRecall({
      teamId: 't',
      datasetIds: ['d'],
      queryGroups: [{ source: 'text', queries: ['苹果'] }],
      limit: 10,
      forbidCollectionIdList: []
    });

    expect(mockSearchSqlFullText).not.toHaveBeenCalled();
    expect(mockFullTextStoreSearch).toHaveBeenCalledWith({
      teamId: 't',
      datasetIds: ['d'],
      query: '苹果',
      limit: 10,
      forbidCollectionIdList: [],
      filterCollectionIdList: undefined
    });
    expect(res.textFullTextRecallResults[0].id).toBe('68ad85a7463006c963799a05');
  });

  it('TC-13.3 result id comes from FullTextSearchItem.dataId, not a vector id', async () => {
    // 被测函数: fullTextRecall  等级: 3-High
    // 归一化: store 返回的 dataId(dataset_data._id)决定结果 id;结果经 imageCaption 分组返回。
    mockUseMilvusStore.value = true;
    mockFullTextStoreSearch.mockReturnValue([
      { dataId: '68ad85a7463006c963799a05', collectionId: 'col1', score: 0.9 }
    ]);
    mockMongoDatasetDataFind.mockReturnValue({
      lean: vi.fn().mockResolvedValue([
        {
          _id: '68ad85a7463006c963799a05',
          datasetId: 'd',
          collectionId: 'col1',
          updateTime: new Date('2026-01-01'),
          q: '苹果',
          a: '一种水果',
          imageId: 'img1',
          chunkIndex: 0,
          indexes: [{ dataId: 'idx1' }]
        }
      ])
    });
    mockMongoDatasetCollectionFind.mockImplementation((query: Record<string, any>) => {
      if (query?.forbid) return { lean: vi.fn().mockResolvedValue([]) };
      return {
        lean: vi.fn().mockResolvedValue([{ _id: 'col1', name: 'Source' }])
      };
    });

    const res = await fullTextRecall({
      teamId: 't',
      datasetIds: ['d'],
      queryGroups: [{ source: 'imageCaption', queries: ['图片描述'] }],
      limit: 10,
      forbidCollectionIdList: []
    });

    expect(mockFullTextStoreSearch).toHaveBeenCalledTimes(1);
    expect(res.imageCaptionFullTextRecallResults[0].id).toBe('68ad85a7463006c963799a05');
  });
});

describe('reRankSearchResults rerank candidate limit', () => {
  const rerankModel = {
    modelId: 'rerank-model',
    provider: 'openai',
    model: 'rerank-model',
    name: 'Rerank Model',
    type: ModelTypeEnum.rerank,
    scope: 'system' as const,
    isActive: true,
    config: {}
  } as any;

  const candidates = Array.from({ length: 150 }, (_, index) => ({
    id: `data-${index}`,
    datasetId: 'dataset-1',
    collectionId: 'collection-1',
    q: `Q${index}`,
    a: `A${index}`,
    chunkIndex: index,
    updateTime: new Date('2026-01-01'),
    score: []
  }));

  const run = (rerankCandidateNum?: number, textRecallResults = candidates) =>
    reRankSearchResults({
      usingReRank: true,
      textRecallResults: textRecallResults as any,
      rerankModel,
      query: 'query',
      rerankWeight: 1,
      rerankCandidateNum,
      teamId: 'team-1'
    });

  beforeEach(() => {
    vi.clearAllMocks();
    mockReRankRecall.mockResolvedValue({
      results: candidates.map((item) => ({ id: item.id, score: 0.9 })),
      inputTokens: 1
    });
  });

  it('只把融合列表按顺序的前 N 条送入重排', async () => {
    await run(20);

    expect(mockReRankRecall.mock.calls[0][0].documents.map((item: any) => item.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `data-${index}`)
    );
  });

  it('召回少于限制时全部送入重排', async () => {
    await run(100, candidates.slice(0, 80));

    expect(mockReRankRecall.mock.calls[0][0].documents).toHaveLength(80);
  });

  it('缺省时按默认 100 截断超过 100 的召回', async () => {
    await run();

    expect(mockReRankRecall.mock.calls[0][0].documents).toHaveLength(100);
  });

  it.each([0, 9, 101, 55.7, Number.NaN])('非法候选数 %s 按默认 100 执行重排', async (value) => {
    await run(value);
    expect(mockReRankRecall.mock.calls[0][0].documents).toHaveLength(100);
  });

  it('重排权重小于 1 时，超出候选数的召回不进入融合结果，不能绕过重排分数过滤', async () => {
    mockReRankRecall.mockResolvedValue({
      results: candidates.slice(0, 20).map((item) => ({ id: item.id, score: 0.1 })),
      inputTokens: 1
    });

    const { results } = await reRankSearchResults({
      usingReRank: true,
      textRecallResults: candidates.slice(0, 30) as any,
      rerankModel,
      query: 'query',
      rerankWeight: 0.5,
      rerankCandidateNum: 20,
      teamId: 'team-1'
    });

    // 20 条重排结果都低于阈值，没有候选应该通过相似度过滤
    expect(
      filterSearchResultsByScore({
        data: results,
        usingReRank: true,
        searchMode: DatasetSearchModeEnum.mixedRecall,
        similarity: 0.4
      }).results.map((item) => item.id)
    ).toEqual([]);
    expect(results.map((item) => item.id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `data-${index}`)
    );
  });
});
