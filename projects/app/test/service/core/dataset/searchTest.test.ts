import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchDatasetTestBodySchema } from '@fastgpt/global/openapi/core/dataset/api';
import { i18nT } from '@fastgpt/global/common/i18n/utils';

const mocks = vi.hoisted(() => ({ search: vi.fn(), getModel: vi.fn(), authorized: vi.fn() }));
vi.mock('@/service/core/dataset/search', () => ({ searchDatasetForApi: mocks.search }));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getTeamModelHandle: async () => ({ getModelData: mocks.getModel })
}));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  getAuthorizedModelIds: mocks.authorized
}));
import { searchDatasetTestForApi } from '@/service/core/dataset/searchTest';

const id = '507f1f77bcf86cd799439011';
const auth = { teamId: id, tmbId: id, isRoot: false, apikey: 'test-key' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorized.mockResolvedValue(new Set(['selected-model']));
  mocks.getModel.mockReturnValue({ modelId: 'selected-model', model: 'legacy-model-name' });
  mocks.search.mockResolvedValue({
    list: [],
    meta: {
      durationMs: 1250,
      searchMode: 'embedding',
      maxTokens: 20000,
      similarity: 0,
      usingReRank: false,
      queryExtensionModelId: 'selected-model'
    }
  });
});

describe('legacy search protocol adapter', () => {
  it('maps legacy model references, images and token limits onto the shared search service', async () => {
    const params = SearchDatasetTestBodySchema.parse({
      datasetId: id,
      queryImageUrls: ['image-key'],
      limit: 50000,
      usingReRank: true,
      rerankModel: 'old-rerank',
      datasetSearchUsingExtensionQuery: true,
      datasetSearchExtensionModel: 'old-llm'
    });
    const onRateLimit = vi.fn();
    const result = await searchDatasetTestForApi({ params, auth, onRateLimit });
    expect(mocks.getModel).toHaveBeenCalledWith(
      { modelId: undefined, model: 'old-rerank' },
      expect.objectContaining({ type: 'rerank', fallbackToDefault: true })
    );
    expect(mocks.search).toHaveBeenCalledWith({
      params: expect.objectContaining({
        scope: { datasetIds: [id] },
        query: { text: '', imageKeys: ['image-key'] },
        result: { maxTokens: 20000, similarity: 0 },
        rerank: { enabled: true, modelId: 'selected-model', weight: 0.5 }
      }),
      auth,
      modelHandle: expect.any(Object),
      usageAppName: i18nT('account_usage:search_test'),
      onRateLimit
    });
    expect(result).toMatchObject({
      duration: '1.250s',
      queryExtensionModel: 'legacy-model-name',
      limit: 20000
    });
  });

  it('keeps optional enhancements disabled and handles unavailable default models', async () => {
    mocks.search.mockResolvedValueOnce({
      list: [],
      meta: {
        durationMs: 0,
        searchMode: 'embedding',
        maxTokens: 5000,
        similarity: 0,
        usingReRank: false
      }
    });
    const params = SearchDatasetTestBodySchema.parse({ datasetId: id, text: 'q' });
    const result = await searchDatasetTestForApi({ params, auth });
    expect(mocks.getModel).not.toHaveBeenCalled();
    expect(result.queryExtensionModel).toBeUndefined();
    mocks.getModel.mockReturnValue(undefined);
    await searchDatasetTestForApi({ params: { ...params, usingReRank: true }, auth });
    expect(mocks.search.mock.calls[1][0].params.rerank).toEqual({ enabled: true, weight: 0.5 });
  });

  it('preserves values accepted by the legacy protocol without applying the new HTTP limits', async () => {
    const text = 'q'.repeat(100001);
    await searchDatasetTestForApi({
      params: SearchDatasetTestBodySchema.parse({
        datasetId: id,
        text,
        similarity: -1,
        limit: 0.5,
        embeddingWeight: 1.25,
        usingReRank: true,
        rerankWeight: -0.2
      }),
      auth
    });
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          query: { text, imageKeys: [] },
          result: { maxTokens: 0.5, similarity: -1 },
          retrieval: { mode: 'embedding', embeddingWeight: 1.25 },
          rerank: { enabled: true, modelId: 'selected-model', weight: -0.2 }
        })
      })
    );
  });
});
