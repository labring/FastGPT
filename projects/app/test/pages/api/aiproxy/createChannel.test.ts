import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  getAIProxyAdminConfig: vi.fn(),
  post: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));
vi.mock('@fastgpt/service/thirdProvider/aiproxy/config', () => ({
  getAIProxyAdminConfig: mocks.getAIProxyAdminConfig
}));
vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: { post: mocks.post }
}));

import handler from '@/pages/api/aiproxy/api/createChannel';

describe('POST /api/aiproxy/api/createChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.getAIProxyAdminConfig.mockReturnValue({
      baseUrl: 'https://aiproxy.example.com',
      token: 'admin-token'
    });
  });

  it('creates a channel using only the server-side administrator credential', async () => {
    const body = { name: 'channel-a', type: 1, key: 'test-key' };
    const upstreamResult = { success: true, data: { id: 10 } };
    const response = { json: vi.fn() };
    mocks.post.mockResolvedValue({ data: upstreamResult });

    await handler({ body } as any, response as any);

    expect(mocks.authSystemAdmin).toHaveBeenCalledOnce();
    expect(mocks.post).toHaveBeenCalledWith('https://aiproxy.example.com/api/channel/', body, {
      headers: { Authorization: 'Bearer admin-token' }
    });
    expect(response.json).toHaveBeenCalledWith(upstreamResult);
  });

  it('does not call AIProxy when administrator authorization fails', async () => {
    const response = { json: vi.fn() };
    mocks.authSystemAdmin.mockRejectedValue(new Error('unAuthorization'));

    await handler({ body: { name: 'channel-a' } } as any, response as any);

    expect(mocks.getAIProxyAdminConfig).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: expect.any(String) })
    );
  });

  it('returns an explicit failure payload when AIProxy rejects channel creation', async () => {
    const response = { json: vi.fn() };
    mocks.post.mockRejectedValue(new Error('duplicate channel'));

    await handler({ body: { name: 'channel-a' } } as any, response as any);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'duplicate channel' })
    );
  });
});
