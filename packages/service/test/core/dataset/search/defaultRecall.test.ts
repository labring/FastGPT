import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum, SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { FullTextSearchProps } from '@fastgpt/service/common/vectorDB/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { serviceEnv } from '@fastgpt/service/env';

const mockGetVectors = vi.hoisted(() => vi.fn());
const mockIsImageEmbeddingModel = vi.hoisted(() => vi.fn());
const mockRecallFromVectorStore = vi.hoisted(() => vi.fn());
const mockCreateLLMResponse = vi.hoisted(() => vi.fn());
const mockMongoDatasetCollectionFind = vi.hoisted(() => vi.fn());
const mockMongoDatasetDataFind = vi.hoisted(() => vi.fn());
const mockMongoDatasetDataTextAggregate = vi.hoisted(() => vi.fn());
const mockGetImageBase64 = vi.hoisted(() => vi.fn());
// ISSUE-015:getFullTextStore 为可切换 mock。mockUseMilvusStore 为独立开关(默认 false),
// milvus 用例置 true 后经 mockFullTextStoreSearch 覆盖,不查 mongo aggregate。
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
  isCustom: false,
  config: {
    defaultToken: 100,
    maxToken: 100,
    weight: 0
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
  isCustom: false,
  config: {
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 30000,
    vision: true
  }
};

vi.mock('@fastgpt/service/core/ai/embedding', () => ({
  getVectors: mockGetVectors
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  isImageEmbeddingModel: mockIsImageEmbeddingModel
}));

vi.mock('@fastgpt/service/common/vectorDB/controller', () => ({
  recallFromVectorStore: mockRecallFromVectorStore
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: mockCreateLLMResponse
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

vi.mock('@fastgpt/service/core/dataset/data/dataTextSchema', () => ({
  MongoDatasetDataText: {
    aggregate: mockMongoDatasetDataTextAggregate
  }
}));

// 覆盖 test/mocks/common/vector.ts 的全局 constants mock(其缺 getVectorType 导出)。
// textStore 经 importOriginal 委托真实 MongoFullTextStore 时需要该导出;defaultRecall 链路本身
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
// 默认(mockUseMilvusStore.value=false)委托真实 MongoFullTextStore.search —— 内部走
// MongoDatasetDataText.aggregate,由 mockMongoDatasetDataTextAggregate 支撑,保持既有 mongo 回归用例;
// milvus 用例置 mockUseMilvusStore.value=true 后经 mockFullTextStoreSearch 覆盖,不查 mongo aggregate。
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
        return new orig.MongoFullTextStore().search(props);
      }
    })
  };
});

import { searchDatasetData } from '../../../../core/dataset/search/defaultRecall';
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

    mockIsImageEmbeddingModel.mockReturnValue(false);
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
      if (query?.forbid) return [];
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
    mockMongoDatasetDataTextAggregate.mockResolvedValue([]);
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
    mockIsImageEmbeddingModel.mockReturnValue(true);
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
    mockIsImageEmbeddingModel.mockReturnValue(true);
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
    mockIsImageEmbeddingModel.mockReturnValue(false);
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
    mockIsImageEmbeddingModel.mockReturnValue(true);
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

  it('should skip blank full-text queries before Mongo text search', async () => {
    mockIsImageEmbeddingModel.mockReturnValue(false);

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
    expect(mockMongoDatasetDataTextAggregate).not.toHaveBeenCalled();
    expect(result.searchRes).toEqual([]);
  });

  it('should only batch-sign S3 keys from results that survive score filtering', async () => {
    mockIsImageEmbeddingModel.mockReturnValue(false);
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
      if (query?.forbid) return [];
      return {
        lean: vi.fn().mockResolvedValue([{ _id: 'collection-1', name: 'Source' }])
      };
    });
    mockMongoDatasetDataFind.mockReturnValueOnce({
      lean: vi.fn().mockResolvedValue([
        {
          _id: 'data-keep',
          datasetId: 'dataset-1',
          collectionId: 'collection-1',
          updateTime: new Date('2026-01-01'),
          q: 'Keep ![image](dataset/team/keep.png)',
          a: '',
          chunkIndex: 0,
          indexes: [{ dataId: 'index-keep' }]
        },
        {
          _id: 'data-filtered',
          datasetId: 'dataset-1',
          collectionId: 'collection-1',
          updateTime: new Date('2026-01-01'),
          q: 'Filtered ![image](dataset/team/filtered.png)',
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
    expect(result.searchRes[0]?.q).toContain('https://files.test/dataset/team/keep.png');
    expect(mockCreateS3DownloadAccessUrls).toHaveBeenCalledTimes(1);
    expect(mockCreateS3DownloadAccessUrls.mock.calls[0][0].map((item) => item.objectKey)).toEqual([
      'dataset/team/keep.png'
    ]);
  });
});

describe('fullTextRecall engine dispatch', () => {
  beforeEach(() => {
    // 每个用例独立:清空所有 mock 调用、重置 store 开关为 mongo 委托、aggregate 默认返回空
    vi.clearAllMocks();
    mockUseMilvusStore.value = false;
    mockFullTextStoreSearch.mockReset();
    mockMongoDatasetDataTextAggregate.mockResolvedValue([]);
  });

  it('TC-13.1 mongo path groups results assembled via store search', async () => {
    // 被测函数: fullTextRecall  等级: 3-High
    // 正常场景(回归): getFullTextStore 默认委托真实 MongoFullTextStore.search(内部走 aggregate,
    // 由 mockMongoDatasetDataTextAggregate 支撑),buildResultsFromRecallItems 反查 data/collection 组装;
    // 结果 id 取自 dataset_data._id。
    mockMongoDatasetDataTextAggregate.mockResolvedValue([
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
      if (query?.forbid) return [];
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

    expect(mockMongoDatasetDataTextAggregate).toHaveBeenCalled();
    expect(res.textFullTextRecallResults[0].id).toBe('68ad85a7463006c963799a05');
    expect(res.textFullTextRecallResults[0].score).toEqual([
      { type: SearchScoreTypeEnum.fullText, value: 2.5, index: 0 }
    ]);
  });

  it('TC-13.2 milvus path assembles via store dispatch without querying mongo aggregate', async () => {
    // 被测函数: fullTextRecall  等级: 3-High
    // 正常场景: getFullTextStore 返回 milvus 实现,mockFullTextStoreSearch 返回 FullTextSearchItem[],
    // buildResultsFromRecallItems 组装结果且不查 mongo aggregate。
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
      if (query?.forbid) return [];
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

    expect(mockMongoDatasetDataTextAggregate).not.toHaveBeenCalled();
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
      if (query?.forbid) return [];
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
