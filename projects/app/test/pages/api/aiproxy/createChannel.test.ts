import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  getAIProxyAdminConfig: vi.fn(),
  post: vi.fn(),
  get: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));
vi.mock('@fastgpt/service/thirdProvider/aiproxy/config', () => ({
  getAIProxyAdminConfig: mocks.getAIProxyAdminConfig
}));
vi.mock('@fastgpt/service/common/api/axios', () => ({
  axiosWithoutSSRF: { post: mocks.post, get: mocks.get }
}));

import handler from '@/pages/api/aiproxy/api/createChannel';

describe('POST /api/aiproxy/api/createChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockReset().mockResolvedValue({ data: { success: true, data: [] } });
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
      headers: { Authorization: 'Bearer admin-token' },
      signal: expect.any(AbortSignal),
      timeout: 30000
    });
    expect(response.json).toHaveBeenCalledWith(upstreamResult);
  });

  it('rejects invalid channel parameters before acquiring a lease or contacting AIProxy', async () => {
    const response = { json: vi.fn() };
    await handler({ body: { name: '   ', type: 1 } } as any, response as any);
    expect(mocks.getAIProxyAdminConfig).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('resolves the exact unique channel name when v0.6.5 returns success without data', async () => {
    mocks.post.mockResolvedValue({ data: { success: true } });
    mocks.get.mockResolvedValueOnce({ data: { success: true, data: [] } }).mockResolvedValueOnce({
      data: {
        success: true,
        data: [
          { id: 99, name: 'unrelated-new-channel', type: 1 },
          { id: 10, name: 'channel-a', type: 1 }
        ]
      }
    });
    const response = { json: vi.fn() };
    await handler({ body: { name: ' channel-a ', type: 1 } } as any, response as any);
    expect(response.json).toHaveBeenCalledWith({ success: true, data: { id: 10 } });
    expect(mocks.get).toHaveBeenCalledTimes(2);
  });

  it('rejects duplicate names on the server before creating a channel', async () => {
    mocks.get.mockResolvedValue({
      data: { success: true, data: [{ id: 10, name: ' channel-a ', type: 1 }] }
    });
    const response = { json: vi.fn() };
    await handler({ body: { name: 'channel-a', type: 1 } } as any, response as any);
    expect(mocks.post).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it.each([
    [],
    [
      { id: 10, name: 'channel-a', type: 1 },
      { id: 11, name: 'channel-a', type: 1 }
    ],
    [{ id: 10, name: 'channel-a', type: 2 }]
  ])(
    'does not invent an ID when the created channel cannot be uniquely resolved: %j',
    async (...channels) => {
      mocks.post.mockResolvedValue({ data: { success: true, data: null } });
      mocks.get.mockResolvedValueOnce({ data: { success: true, data: [] } }).mockResolvedValueOnce({
        data: { success: true, data: channels }
      });
      const response = { json: vi.fn() };
      await handler({ body: { name: 'channel-a', type: 1 } } as any, response as any);
      expect(response.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: expect.stringContaining('Channel created')
        })
      );
      expect(mocks.post).toHaveBeenCalledOnce();
    }
  );

  it('rejects multiple credentials before contacting AIProxy', async () => {
    const response = { json: vi.fn() };
    await handler(
      { body: { name: 'channel-a', type: 1, key: 'first\nsecond' } } as any,
      response as any
    );
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('reports a committed creation when the follow-up read fails, without retrying the write', async () => {
    mocks.post.mockResolvedValue({ data: { success: true } });
    mocks.get
      .mockResolvedValueOnce({ data: { success: true, data: [] } })
      .mockRejectedValueOnce(new Error('connection reset'));
    const response = { json: vi.fn() };
    await handler({ body: { name: 'channel-a', type: 1 } } as any, response as any);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('Channel created')
      })
    );
    expect(mocks.post).toHaveBeenCalledOnce();
  });

  it('preserves a rejected upstream business response without resolving an ID', async () => {
    mocks.post.mockResolvedValue({ data: { success: false, message: 'provider rejected' } });
    const response = { json: vi.fn() };
    await handler({ body: { name: 'channel-a', type: 1 } } as any, response as any);
    expect(response.json).toHaveBeenCalledWith({ success: false, message: 'provider rejected' });
    expect(mocks.get).toHaveBeenCalledOnce();
  });

  it('does not call AIProxy when administrator authorization fails', async () => {
    const response = { json: vi.fn() };
    mocks.authSystemAdmin.mockRejectedValue(new Error('unAuthorization'));

    await handler({ body: { name: 'channel-a', type: 1 } } as any, response as any);

    expect(mocks.getAIProxyAdminConfig).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: expect.any(String) })
    );
  });

  it('returns an explicit failure payload when AIProxy rejects channel creation', async () => {
    const response = { json: vi.fn() };
    mocks.post.mockRejectedValue(new Error('duplicate channel'));

    await handler({ body: { name: 'channel-a', type: 1 } } as any, response as any);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'duplicate channel' })
    );
  });
});
