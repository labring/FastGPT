import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const mockAuthDataset = vi.hoisted(() => vi.fn());
const mockCheckTeamAIPoints = vi.hoisted(() => vi.fn());
const mockDefaultSearchDatasetData = vi.hoisted(() => vi.fn());
const mockDeepRagSearch = vi.hoisted(() => vi.fn());
const mockPushDatasetTestUsage = vi.hoisted(() => vi.fn());
const mockUpdateApiKeyUsage = vi.hoisted(() => vi.fn());
const mockGetRerankModelData = vi.hoisted(() => vi.fn());
const mockGetEmbeddingModelData = vi.hoisted(() => vi.fn());
const mockGetLLMModelData = vi.hoisted(() => vi.fn());
const mockGetOptionalVlmModelData = vi.hoisted(() => vi.fn());
const mockAddAuditLog = vi.hoisted(() => vi.fn());
const mockCreateExternalUrl = vi.hoisted(() => vi.fn());
const mockTeamFrequencyLimit = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDataset: mockAuthDataset
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamAIPoints: mockCheckTeamAIPoints
}));

vi.mock('@fastgpt/service/core/dataset/search', () => ({
  defaultSearchDatasetData: mockDefaultSearchDatasetData,
  deepRagSearch: mockDeepRagSearch
}));

vi.mock('@/service/support/wallet/usage/push', () => ({
  pushDatasetTestUsage: mockPushDatasetTestUsage
}));

vi.mock('@fastgpt/service/support/openapi/tools', () => ({
  updateApiKeyUsage: mockUpdateApiKeyUsage
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getRerankModelData: mockGetRerankModelData,
  getEmbeddingModelData: mockGetEmbeddingModelData,
  getLLMModelData: mockGetLLMModelData,
  getOptionalVlmModelData: mockGetOptionalVlmModelData
}));

vi.mock('@fastgpt/service/support/user/audit/util', () => ({
  addAuditLog: mockAddAuditLog,
  getI18nDatasetType: vi.fn((type: string) => type)
}));

vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({
    createExternalUrl: mockCreateExternalUrl
  })
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((...args: unknown[]) => args.at(-1))
}));

vi.mock('@fastgpt/service/common/api/frequencyLimit', () => ({
  LimitTypeEnum: { chat: 'chat' },
  teamFrequencyLimit: mockTeamFrequencyLimit
}));

import { handler } from '@/pages/api/core/dataset/searchTest';

const datasetId = '507f1f77bcf86cd799439011';

describe('searchTest query image auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockAuthDataset.mockResolvedValue({
      dataset: {
        name: 'dataset',
        type: DatasetTypeEnum.dataset,
        vectorModel: 'mock-vector-model',
        vlmModel: 'mock-vlm-model'
      },
      teamId: 'team-1',
      tmbId: 'tmb-1',
      userId: 'user-1'
    });
    mockTeamFrequencyLimit.mockResolvedValue(true);
    mockCheckTeamAIPoints.mockResolvedValue(undefined);
    mockGetEmbeddingModelData.mockReturnValue({
      modelId: '68ad85a7463006c963799a01',
      model: 'mock-vector-model',
      name: 'Mock vector model',
      type: 'embedding',
      config: {}
    });
    mockGetOptionalVlmModelData.mockReturnValue({
      modelId: '68ad85a7463006c963799a02',
      model: 'mock-vlm-model',
      name: 'Mock VLM model',
      type: 'llm',
      config: { vision: true }
    });
    mockGetRerankModelData.mockReturnValue({
      modelId: '68ad85a7463006c963799a03',
      model: 'mock-rerank-model',
      name: 'Mock rerank model',
      type: 'rerank',
      config: {}
    });
    mockGetLLMModelData.mockReturnValue({
      modelId: '68ad85a7463006c963799a04',
      model: 'mock-llm-model',
      name: 'Mock LLM model',
      type: 'llm',
      config: {}
    });
    mockPushDatasetTestUsage.mockReturnValue({
      totalPoints: 0
    });
    mockDefaultSearchDatasetData.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 0,
      reRankInputTokens: 0,
      usingReRank: false,
      limit: 5000,
      searchMode: DatasetSearchModeEnum.embedding,
      similarity: 0
    });
    mockCreateExternalUrl.mockResolvedValue({
      url: 'https://file.fastgpt.io/temp/team-1/search-image.png?token=mock'
    });
  });

  it('should convert current-team temp image keys to external urls before dataset search', async () => {
    const res = {} as any;
    await handler(
      {
        body: {
          datasetId,
          queryImageUrls: ['temp/team-1/search-image.png']
        }
      } as any,
      res
    );

    expect(mockDefaultSearchDatasetData).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
        datasetIds: [datasetId],
        textQueries: [],
        imageQueries: ['https://file.fastgpt.io/temp/team-1/search-image.png?token=mock']
      })
    );
    expect(mockCreateExternalUrl).toHaveBeenCalledWith({
      key: 'temp/team-1/search-image.png',
      expiredHours: 1
    });
    expect(mockTeamFrequencyLimit).toHaveBeenCalledWith({
      teamId: 'team-1',
      type: 'chat',
      res
    });
  });

  it('should reject non-temp or foreign-team query image keys before dataset search', async () => {
    await expect(
      handler(
        {
          body: {
            datasetId,
            queryImageUrls: [
              'temp/team-2/search-image.png',
              'dataset/dataset-1/image.png',
              'chat/app-1/user-1/chat-1/image.png',
              'https://example.com/image.png'
            ]
          }
        } as any,
        {} as any
      )
    ).rejects.toBe('Invalid query image key');

    expect(mockDefaultSearchDatasetData).not.toHaveBeenCalled();
    expect(mockDeepRagSearch).not.toHaveBeenCalled();
    expect(mockCreateExternalUrl).not.toHaveBeenCalled();
  });

  it('should stop before searching when the shared team chat QPM is exhausted', async () => {
    mockTeamFrequencyLimit.mockResolvedValue(false);

    await expect(
      handler(
        {
          body: {
            datasetId,
            text: 'query'
          }
        } as any,
        {} as any
      )
    ).resolves.toBeUndefined();

    expect(mockCheckTeamAIPoints).not.toHaveBeenCalled();
    expect(mockDefaultSearchDatasetData).not.toHaveBeenCalled();
    expect(mockDeepRagSearch).not.toHaveBeenCalled();
  });
});
