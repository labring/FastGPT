import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAxiosPost, mockGetRedisCache, mockSetRedisCache, mockDelRedisCache } = vi.hoisted(
  () => ({
    mockAxiosPost: vi.fn(),
    mockGetRedisCache: vi.fn(),
    mockSetRedisCache: vi.fn(),
    mockDelRedisCache: vi.fn()
  })
);

vi.mock('../../../common/api/axios', () => ({ axios: { post: mockAxiosPost } }));
vi.mock('../../../common/redis/cache', () => ({
  getRedisCache: mockGetRedisCache,
  setRedisCache: mockSetRedisCache,
  delRedisCache: mockDelRedisCache
}));
vi.mock('../../../common/logger', () => ({
  getLogger: () => ({ warn: vi.fn() }),
  LogCategories: { MODULE: { OUTLINK: { DINGTALK: 'outlink.dingtalk' } } }
}));

import { getDingtalkAppAccessToken } from '@fastgpt/service/common/dingtalk/accessToken';

const credentials = { appKey: 'ding-app', appSecret: 'ding-secret' };

describe('getDingtalkAppAccessToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedisCache.mockResolvedValue(null);
    mockSetRedisCache.mockResolvedValue(undefined);
    mockDelRedisCache.mockResolvedValue(undefined);
    mockAxiosPost.mockResolvedValue({ data: { accessToken: 'access-token', expireIn: 7200 } });
  });

  it('caches tokens before DingTalk expiry', async () => {
    await expect(getDingtalkAppAccessToken(credentials)).resolves.toBe('access-token');

    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/v1.0/oauth2/accessToken'),
      credentials
    );
    expect(mockSetRedisCache).toHaveBeenCalledWith(
      expect.stringMatching(/^dingtalk:accessToken:ding-app:/),
      'access-token',
      6900
    );
  });

  it('shares concurrent token refreshes', async () => {
    let resolveRequest!: (value: { data: { accessToken: string; expireIn: number } }) => void;
    mockAxiosPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    const first = getDingtalkAppAccessToken(credentials);
    const second = getDingtalkAppAccessToken(credentials);
    await vi.waitFor(() => expect(mockAxiosPost).toHaveBeenCalledTimes(1));
    resolveRequest({ data: { accessToken: 'access-token', expireIn: 7200 } });

    await expect(Promise.all([first, second])).resolves.toEqual(['access-token', 'access-token']);
    expect(mockAxiosPost).toHaveBeenCalledTimes(1);
  });

  it('clears stale cache data when refresh fails', async () => {
    mockAxiosPost.mockRejectedValue(new Error('DingTalk unavailable'));

    await expect(getDingtalkAppAccessToken(credentials)).rejects.toThrow('钉钉应用鉴权失败');
    expect(mockDelRedisCache).toHaveBeenCalledWith(expect.stringMatching(/^dingtalk:accessToken:/));
  });
});
