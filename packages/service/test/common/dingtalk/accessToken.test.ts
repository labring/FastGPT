import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAxiosPost, mockGetOrRefresh } = vi.hoisted(() => ({
  mockAxiosPost: vi.fn(),
  mockGetOrRefresh: vi.fn()
}));

vi.mock('../../../common/api/axios', () => ({ axios: { post: mockAxiosPost } }));
vi.mock('@fastgpt/dal/redis/caches', () => ({
  DingtalkAccessTokenCache: class {
    getOrRefresh = mockGetOrRefresh;
  }
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
    mockGetOrRefresh.mockImplementation(({ fetchToken }) => fetchToken());
    mockAxiosPost.mockResolvedValue({ data: { accessToken: 'access-token', expireIn: 7200 } });
  });

  it('uses the DAL token cache to fetch a DingTalk access token', async () => {
    await expect(getDingtalkAppAccessToken(credentials)).resolves.toBe('access-token');

    expect(mockAxiosPost).toHaveBeenCalledWith(
      expect.stringContaining('/v1.0/oauth2/accessToken'),
      credentials
    );
    expect(mockGetOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ server: credentials, fetchToken: expect.any(Function) })
    );
  });

  it('maps rate-limit failures to a stable user-facing error', async () => {
    mockGetOrRefresh.mockRejectedValue({ response: { status: 429 } });

    await expect(getDingtalkAppAccessToken(credentials)).rejects.toBe(
      '钉钉鉴权接口请求过快，请稍后重试'
    );
  });
});
