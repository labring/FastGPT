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
        result: { maxTokens: 5000, similarity: 0 }
      },
      auth: expect.objectContaining({ teamId: id, apikey: 'test-key' })
    });
    expect(result.list).toEqual([]);
  });

  it.each([
    { scope: { datasetIds: [] }, query: { text: 'q' } },
    { scope: { datasetIds: [id] }, query: { text: ' ' } },
    { scope: { datasetIds: [id] }, query: { text: 'q' }, actor: { isRoot: true } },
    {
      scope: { datasetIds: [id] },
      query: { text: 'q' },
      rerank: { enabled: false, modelId: 'unexpected' }
    },
    { scope: { datasetIds: [id] }, query: { text: 'q' }, result: { maxTokens: 0 } },
    { scope: { datasetIds: [id] }, query: { text: 'q' }, result: { maxTokens: 20001 } },
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
