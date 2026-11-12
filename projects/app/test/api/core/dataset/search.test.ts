import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), search: vi.fn() }));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/auth/common', async (original) => ({
  ...(await original<object>()),
  parseHeaderCert: mocks.auth
}));
vi.mock('@/service/core/dataset/search', () => ({ searchDatasetForApi: mocks.search }));
import { handler } from '@/pages/api/core/dataset/search';

const id = '507f1f77bcf86cd799439011';
const request = (body: unknown) =>
  ({ body, headers: { authorization: 'Bearer test-key' } }) as ApiRequestProps;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ teamId: id, tmbId: id, apikey: 'test-key', isRoot: false });
  mocks.search.mockResolvedValue({
    list: [],
    meta: {
      durationMs: 10,
      searchMode: 'embedding',
      maxTokens: 5000,
      similarity: 0,
      usingSimilarityFilter: true,
      usingReRank: false
    }
  });
});

describe('structured knowledge search HTTP boundary', () => {
  it('supplies normalized defaults and server-authenticated identity to the application service', async () => {
    const result = await handler(
      request({ scope: { datasetIds: [id] }, query: { text: 'question' } })
    );
    expect(mocks.auth).toHaveBeenCalledWith(
      expect.objectContaining({ authApiKey: true, authToken: true })
    );
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith({
      params: {
        scope: { datasetIds: [id] },
        query: { text: 'question', imageKeys: [] },
        retrieval: { mode: 'embedding', embeddingWeight: 0.5 },
        rerank: { enabled: false },
        queryExtension: { enabled: false },
        result: { topk: 20, similarity: 0 }
      },
      auth: expect.objectContaining({ teamId: id, apikey: 'test-key' }),
      usageAppName: 'account_usage:dataset_search'
    });
    expect(result.list).toEqual([]);
    expect(result.meta).toEqual({
      durationMs: 10,
      usingSimilarityFilter: true,
      usingReRank: false
    });
  });

  it('maps the search test billing scene without passing it into retrieval parameters', async () => {
    await handler(
      request({
        scope: { datasetIds: [id] },
        query: { text: 'question' },
        usageScene: 'searchTest'
      })
    );
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({
        usageAppName: 'account_usage:search_test'
      })
    );
    expect(mocks.search.mock.calls[0][0].params).not.toHaveProperty('usageScene');
  });

  it.each([
    { topk: 1 },
    { topk: 100, maxTokens: 1 },
    { maxTokens: 25000 },
    { topk: 20, maxTokens: 0 },
    { topk: 20, maxTokens: 'ignored' }
  ])('passes only the effective budget to the shared search service: %j', async (budget) => {
    await handler(request({ scope: { datasetIds: [id] }, query: { text: 'q' }, result: budget }));
    const effectiveBudget = 'topk' in budget ? { topk: budget.topk } : budget;
    expect(mocks.search.mock.calls[0][0].params.result).toEqual({
      ...effectiveBudget,
      similarity: 0
    });
  });

  it.each([{ imageKeys: undefined }, { imageKeys: ['temp/team/search-image.png'] }])(
    'accepts 10000 query characters after trimming, with images: %j',
    async ({ imageKeys }) => {
      const text = 'q'.repeat(10000);
      await handler(
        request({ scope: { datasetIds: [id] }, query: { text: `  ${text}  `, imageKeys } })
      );
      expect(mocks.search.mock.calls[0][0].params.query.text).toBe(text);
    }
  );

  it.each([
    null,
    [],
    ...[null, [], 'invalid'].map((result) => ({
      scope: { datasetIds: [id] },
      query: { text: 'q' },
      result
    })),
    { scope: { datasetIds: [] }, query: { text: 'q' } },
    { scope: { datasetIds: [id] }, query: { text: ' ' } },
    ...[undefined, ['temp/team/search-image.png']].map((imageKeys) => ({
      scope: { datasetIds: [id] },
      query: { text: 'q'.repeat(10001), imageKeys }
    })),
    { scope: { datasetIds: [id] }, query: { text: 'q' }, actor: { isRoot: true } },
    { scope: { datasetIds: [id] }, query: { text: 'q' }, usageScene: 'custom-name' },
    {
      scope: { datasetIds: [id] },
      query: { text: 'q' },
      rerank: { enabled: false, modelId: 'unexpected' }
    },
    { scope: { datasetIds: [id] }, query: { text: 'q' }, result: { maxTokens: 0 } },
    { scope: { datasetIds: [id] }, query: { text: 'q' }, result: { maxTokens: 0.5 } },
    {
      scope: { datasetIds: [id] },
      query: { text: 'q' },
      result: { topk: 20, maxTokens: 5000, unknownField: true }
    },
    ...[0, 101, 1.5, '10'].map((topk) => ({
      scope: { datasetIds: [id] },
      query: { text: 'q' },
      result: { topk, maxTokens: 5000 }
    })),
    { scope: { datasetIds: [id] }, query: { text: 'q' }, retrieval: { embeddingWeight: 1.1 } },
    { scope: { datasetIds: [id] }, query: { text: 'q' }, retrieval: { embeddingWeight: '0.5' } },
    { scope: { datasetIds: [id] }, query: { text: 'q' }, rerank: { enabled: 'false' } },
    { scope: { datasetIds: [id], filter: { tags: {} } }, query: { text: 'q' } },
    {
      scope: {
        datasetIds: [id],
        filter: { createTime: { gte: '2026-02-01T00:00:00Z', lte: '2026-01-01T00:00:00Z' } }
      },
      query: { text: 'q' }
    }
  ])('rejects invalid or forged request configuration', async (body) => {
    await expect(handler(request(body))).rejects.toBeInstanceOf(ApiRequestInputParseError);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.search).not.toHaveBeenCalled();
  });

  it('does not search when API Key authentication fails', async () => {
    mocks.auth.mockRejectedValue(new Error('unauthorized'));
    await expect(
      handler(request({ scope: { datasetIds: [id] }, query: { text: 'q' } }))
    ).rejects.toThrow('unauthorized');
    expect(mocks.search).not.toHaveBeenCalled();
  });
});
