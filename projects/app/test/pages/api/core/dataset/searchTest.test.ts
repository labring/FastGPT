import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';

const mockAuthDataset = vi.hoisted(() => vi.fn());
const mockCheckTeamAIPoints = vi.hoisted(() => vi.fn());
const mockDefaultSearchDatasetData = vi.hoisted(() => vi.fn());
const mockDeepRagSearch = vi.hoisted(() => vi.fn());
const mockPushDatasetTestUsage = vi.hoisted(() => vi.fn());
const mockUpdateApiKeyUsage = vi.hoisted(() => vi.fn());
const mockGetRerankModel = vi.hoisted(() => vi.fn());
const mockAddAuditLog = vi.hoisted(() => vi.fn());
const mockCreateExternalUrl = vi.hoisted(() => vi.fn());

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
  getRerankModel: mockGetRerankModel
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

vi.mock('@fastgpt/service/common/middle/reqFrequencyLimit', () => ({
  useIPFrequencyLimit: vi.fn((props: unknown) => props)
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
    mockCheckTeamAIPoints.mockResolvedValue(undefined);
    mockGetRerankModel.mockReturnValue({
      model: 'mock-rerank-model'
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
    await handler({
      body: {
        datasetId,
        queryImageUrls: ['temp/team-1/search-image.png']
      }
    } as any);

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
  });

  it('should reject non-temp or foreign-team query image keys before dataset search', async () => {
    await expect(
      handler({
        body: {
          datasetId,
          queryImageUrls: [
            'temp/team-2/search-image.png',
            'dataset/dataset-1/image.png',
            'chat/app-1/user-1/chat-1/image.png',
            'https://example.com/image.png'
          ]
        }
      } as any)
    ).rejects.toBe('Invalid query image key');

    expect(mockDefaultSearchDatasetData).not.toHaveBeenCalled();
    expect(mockDeepRagSearch).not.toHaveBeenCalled();
    expect(mockCreateExternalUrl).not.toHaveBeenCalled();
  });
});
