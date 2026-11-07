import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), search: vi.fn() }));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/support/permission/auth/common', async (original) => ({
  ...(await original<object>()),
  parseHeaderCert: mocks.auth
}));
vi.mock('@/service/core/dataset/searchTest', () => ({ searchDatasetTestForApi: mocks.search }));
import { handler } from '@/pages/api/core/dataset/searchTest';

const id = '507f1f77bcf86cd799439011';
const auth = { teamId: id, tmbId: id, isRoot: false, apikey: 'test-key' };
const request = (body: unknown) =>
  ({ body, headers: { authorization: 'Bearer test-key' } }) as ApiRequestProps;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue(auth);
  mocks.search.mockResolvedValue({
    list: [],
    duration: '0.010s',
    limit: 5000,
    searchMode: 'embedding',
    usingReRank: false,
    similarity: 0
  });
});

describe('legacy searchTest HTTP boundary', () => {
  it('validates the legacy shape and delegates authenticated execution', async () => {
    const result = await handler(request({ datasetId: id, text: 'question' }));
    expect(mocks.auth).toHaveBeenCalledWith(
      expect.objectContaining({ authToken: true, authApiKey: true })
    );
    expect(mocks.search).toHaveBeenCalledExactlyOnceWith({
      params: expect.objectContaining({ datasetId: id, text: 'question', queryImageUrls: [] }),
      auth,
      onRateLimit: expect.any(Function)
    });
    expect(result).toMatchObject({ list: [], limit: 5000, searchMode: 'embedding' });
  });

  it('retains rate limit response headers without putting policies in the HTTP handler', async () => {
    const setHeader = vi.fn();
    mocks.search.mockImplementationOnce(async ({ onRateLimit }) => {
      onRateLimit({ limit: 100, remaining: 99, resetAt: 123456 });
      return {
        list: [],
        duration: '0s',
        limit: 5000,
        searchMode: 'embedding',
        usingReRank: false,
        similarity: 0
      };
    });
    await handler(request({ datasetId: id, text: 'q' }), { setHeader } as unknown as Parameters<
      typeof handler
    >[1]);
    expect(setHeader.mock.calls).toEqual([
      ['X-RateLimit-Limit', 100],
      ['X-RateLimit-Remaining', 99],
      ['X-RateLimit-Reset', 123456]
    ]);
  });

  it('retains image-only input and strips retired request options', async () => {
    await handler(
      request({ datasetId: id, queryImageUrls: ['temp/team/image.png'], retiredOption: 'ignored' })
    );
    const params = mocks.search.mock.calls[0][0].params;
    expect(params.text).toBe('');
    expect(params.queryImageUrls).toEqual(['temp/team/image.png']);
    expect(params).not.toHaveProperty('retiredOption');
  });

  it.each([
    { datasetId: id },
    { datasetId: id, text: '   ' },
    { datasetId: 'invalid', text: 'q' },
    { datasetId: id, queryImageUrls: Array(11).fill('image') }
  ])('rejects invalid input before authentication and search', async (body) => {
    await expect(handler(request(body))).rejects.toBeInstanceOf(ApiRequestInputParseError);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.auth).not.toHaveBeenCalled();
  });

  it('validates service output and strips private implementation fields', async () => {
    mocks.search.mockResolvedValueOnce({
      list: [],
      duration: '0s',
      limit: 5000,
      searchMode: 'embedding',
      usingReRank: false,
      similarity: 0,
      apikey: 'private'
    });
    expect(await handler(request({ datasetId: id, text: 'q' }))).not.toHaveProperty('apikey');
    mocks.search.mockResolvedValueOnce({ list: 'invalid' });
    await expect(handler(request({ datasetId: id, text: 'q' }))).rejects.toThrow();
  });
});
