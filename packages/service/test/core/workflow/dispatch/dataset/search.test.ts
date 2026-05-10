import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';

const mockDefaultSearchDatasetData = vi.hoisted(() => vi.fn());
const mockMongoDatasetFindById = vi.hoisted(() => vi.fn());
const mockUsagePush = vi.hoisted(() => vi.fn());

vi.mock('@fastgpt/service/core/dataset/search/controller', () => ({
  defaultSearchDatasetData: mockDefaultSearchDatasetData,
  deepRagSearch: vi.fn()
}));

vi.mock('@fastgpt/service/core/dataset/schema', () => ({
  MongoDataset: {
    findById: mockMongoDatasetFindById
  }
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getEmbeddingModel: vi.fn(() => ({
    model: 'mock-embedding-model',
    name: 'Mock Embedding Model'
  })),
  getRerankModel: vi.fn(() => undefined)
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: vi.fn(() => ({
    totalPoints: 0,
    modelName: 'Mock Model'
  }))
}));

vi.mock('@fastgpt/service/core/dataset/utils', () => ({
  filterDatasetsByTmbId: vi.fn()
}));

import { dispatchDatasetSearch } from '@fastgpt/service/core/workflow/dispatch/dataset/search';

const createProps = (userChatInput: string | string[]) =>
  ({
    runningAppInfo: {
      teamId: 'team-1'
    },
    runningUserInfo: {
      tmbId: 'tmb-1'
    },
    histories: [],
    node: {
      name: 'Dataset Search'
    },
    params: {
      datasets: [
        {
          datasetId: 'dataset-1',
          name: 'Dataset',
          avatar: ''
        }
      ],
      similarity: 0.4,
      limit: 5000,
      userChatInput,
      authTmbId: false,
      searchMode: DatasetSearchModeEnum.embedding,
      embeddingWeight: 0.5,
      usingReRank: false,
      rerankModel: '',
      rerankWeight: 0.5,
      datasetSearchUsingExtensionQuery: false,
      datasetSearchExtensionModel: '',
      datasetSearchExtensionBg: '',
      collectionFilterMatch: ''
    },
    usagePush: mockUsagePush
  }) as any;

describe('dispatchDatasetSearch query images', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockMongoDatasetFindById.mockReturnValue({
      lean: vi.fn().mockResolvedValue({
        vectorModel: {
          model: 'mock-embedding-model'
        },
        vlmModel: ''
      })
    });

    mockDefaultSearchDatasetData.mockResolvedValue({
      searchRes: [],
      embeddingTokens: 0,
      reRankInputTokens: 0,
      usingSimilarityFilter: false,
      usingReRank: false,
      queryExtensionResult: undefined,
      imageCaptionResult: undefined,
      deepSearchResult: undefined
    });
  });

  it('should include image inputs in node response queryImages', async () => {
    const response = await dispatchDatasetSearch(
      createProps(['black high heels', 'temp/team-1/current.png', 'temp/team-1/manual.pdf'])
    );

    expect(response[DispatchNodeResponseKeyEnum.nodeResponse]?.query).toBe('black high heels');
    expect(response[DispatchNodeResponseKeyEnum.nodeResponse]?.queryImages).toEqual([
      {
        key: 'temp/team-1/current.png',
        name: 'current.png'
      }
    ]);
    expect(response[DispatchNodeResponseKeyEnum.nodeResponse]?.filteredFileCount).toBe(1);
  });

  it('should keep text-only search response unchanged', async () => {
    const response = await dispatchDatasetSearch(createProps('black high heels'));

    expect(response[DispatchNodeResponseKeyEnum.nodeResponse]?.query).toBe('black high heels');
    expect(response[DispatchNodeResponseKeyEnum.nodeResponse]?.queryImages).toBeUndefined();
  });
});
