import handler from '@/pages/api/core/dataset/custom/searchApi';
import type { SearchApiBody, SearchApiResponse } from '@fastgpt/global/openapi/core/dataset/api';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { getRootUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock the search controller to avoid needing a real vector DB and embedding model
vi.mock('@fastgpt/service/core/dataset/search/controller', () => ({
  defaultSearchDatasetData: vi.fn().mockResolvedValue({
    searchRes: [],
    embeddingTokens: 0,
    reRankInputTokens: 0,
    usingReRank: false,
    queryExtensionResult: undefined,
    deepSearchResult: null,
    agenticSearchResult: null,
    similarity: 0.3,
    searchMode: 'mixedRecall',
    limit: 5000
  }),
  deepRagSearch: vi.fn().mockResolvedValue({
    searchRes: [],
    embeddingTokens: 0,
    reRankInputTokens: 0,
    usingReRank: false,
    queryExtensionResult: undefined,
    deepSearchResult: null,
    agenticSearchResult: {
      reasoningText: 'search reasoning',
      searchCount: 1,
      toolCallCount: 2
    },
    similarity: 0.3,
    searchMode: 'mixedRecall',
    limit: 5000,
    llmModelId: 'mock-llm-id',
    llmInputTokens: 100,
    llmOutputTokens: 50
  })
}));

// Mock billing/usage to avoid needing real wallet setup
vi.mock('@/service/support/wallet/usage/push', () => ({
  pushDatasetTestUsage: vi.fn().mockReturnValue({ totalPoints: 0 })
}));

vi.mock('@fastgpt/service/support/openapi/tools', () => ({
  updateApiKeyUsage: vi.fn()
}));

describe('searchApi test', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return empty list for no matching data', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test-search',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModelId: 'mock-embedding-id',
      agentModelId: 'mock-llm-id'
    });

    const res = await Call<SearchApiBody, {}, SearchApiResponse>(handler, {
      auth: root,
      cookies: {},
      body: {
        datasetIds: [String(dataset._id)],
        text: 'test query'
      }
    });

    expect(res.code).toBe(200);
    expect(res.data).toBeDefined();
    expect(res.data.list).toEqual([]);
    expect(res.data.duration).toBeDefined();
  });

  it('should support agentic search mode', async () => {
    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test-deep-search',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModelId: 'mock-embedding-id',
      agentModelId: 'mock-llm-id'
    });

    const res = await Call<SearchApiBody, {}, SearchApiResponse>(handler, {
      auth: root,
      cookies: {},
      body: {
        datasetIds: [String(dataset._id)],
        text: 'deep search test',
        agenticSearch: true,
        datasetDeepSearchModelId: 'mock-llm-id',
        datasetDeepSearchMaxTimes: 3
      }
    });

    expect(res.code).toBe(200);
    expect(res.data).toBeDefined();
    expect(res.data.agenticSearchResult).toBeDefined();
    expect(res.data.agenticSearchResult?.reasoningText).toBe('search reasoning');
    expect(res.data.agenticSearchResult?.searchCount).toBe(1);
    expect(res.data.agenticSearchResult?.toolCallCount).toBe(2);
  });

  it('should reject when datasetIds is empty', async () => {
    const root = await getRootUser();

    const res = await Call<SearchApiBody, {}, SearchApiResponse>(handler, {
      auth: root,
      cookies: {},
      body: {
        datasetIds: [],
        text: 'test query'
      }
    });

    expect(res.code).toBe(500);
  });

  it('should support search with re-rank enabled', async () => {
    // Mock getRerankModelById to return a fake rerank model since no rerank model
    // is set up in the test environment's setupModels
    vi.doMock('@fastgpt/service/core/ai/model', () => {
      const actual = vi.importActual('@fastgpt/service/core/ai/model');
      return {
        ...actual,
        getRerankModelById: vi.fn().mockReturnValue({
          id: 'mock-rerank-id',
          type: 'rerank',
          model: 'mock-rerank',
          name: 'mock-rerank',
          requestUrl: undefined,
          requestAuth: undefined,
          isActive: true
        })
      };
    });

    // Also need to mock authModel for rerank - add rerank to global model maps
    const mockRerankModel: RerankModelItemType = {
      id: 'mock-rerank-id',
      type: ModelTypeEnum.rerank,
      model: 'mock-rerank',
      name: 'mock-rerank',
      isActive: true,
      requestUrl: undefined,
      requestAuth: undefined,
      isShared: true,
      provider: 'OpenAI',
      maxToken: 3000
    };
    global.reRankModelIdMap = global.reRankModelIdMap || new Map();
    global.reRankModelIdMap.set('mock-rerank-id', mockRerankModel);
    global.systemModelIdMap?.set('mock-rerank-id', mockRerankModel);

    const root = await getRootUser();
    const dataset = await MongoDataset.create({
      name: 'test-rerank',
      teamId: root.teamId,
      tmbId: root.tmbId,
      vectorModelId: 'mock-embedding-id',
      agentModelId: 'mock-llm-id'
    });

    const res = await Call<SearchApiBody, {}, SearchApiResponse>(handler, {
      auth: root,
      cookies: {},
      body: {
        datasetIds: [String(dataset._id)],
        text: 'rerank test',
        usingReRank: true,
        rerankModelId: 'mock-rerank-id',
        similarity: 0.5,
        limit: 100
      }
    });

    expect(res.code).toBe(200);
    expect(res.data).toBeDefined();
    expect(res.data.list).toEqual([]);
    expect(res.data.duration).toBeDefined();
  });
});
