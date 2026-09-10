import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSystemAdmin: vi.fn(),
  getAIProxyAdminConfig: vi.fn(),
  jsonRes: vi.fn(),
  fetch: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/user/auth', () => ({
  authSystemAdmin: mocks.authSystemAdmin
}));
vi.mock('@fastgpt/service/thirdProvider/aiproxy/config', () => ({
  getAIProxyAdminConfig: mocks.getAIProxyAdminConfig
}));
vi.mock('@fastgpt/service/common/response', () => ({ jsonRes: mocks.jsonRes }));

import handler from '@/pages/api/aiproxy/[...path]';

const createResponse = () => {
  const response = {
    setHeader: vi.fn(),
    status: vi.fn(),
    end: vi.fn()
  };
  response.status.mockReturnValue(response);
  return response;
};

describe('AIProxy administrator proxy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.authSystemAdmin.mockResolvedValue(undefined);
    mocks.getAIProxyAdminConfig.mockReturnValue({
      baseUrl: 'https://aiproxy.example.com',
      token: 'admin-token'
    });
    mocks.fetch.mockResolvedValue(
      new Response(null, {
        status: 202,
        headers: {
          'x-upstream': 'ok',
          'content-encoding': 'gzip',
          'transfer-encoding': 'chunked'
        }
      })
    );
  });

  it('authenticates the administrator and safely forwards the request', async () => {
    const response = createResponse();

    await handler(
      {
        method: 'GET',
        query: { path: ['api', 'channels', 'all'], keyword: 'a b' },
        headers: {
          cookie: 'session=private',
          host: 'localhost:3000',
          origin: 'https://attacker.example.com',
          connection: 'keep-alive',
          authorization: 'Bearer client-token',
          'x-client': 'preserved'
        }
      } as any,
      response as any
    );

    expect(mocks.authSystemAdmin).toHaveBeenCalledOnce();
    const request = mocks.fetch.mock.calls[0][0] as Request;
    expect(request.url).toBe('https://aiproxy.example.com/api/channels/all?keyword=a+b');
    expect(request.headers.get('authorization')).toBe('Bearer admin-token');
    expect(request.headers.get('x-client')).toBe('preserved');
    expect(request.headers.get('cookie')).toBeNull();
    expect(request.headers.get('host')).toBeNull();
    expect(request.headers.get('origin')).toBeNull();
    expect(request.headers.get('connection')).toBeNull();
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.setHeader).toHaveBeenCalledWith('x-upstream', 'ok');
    expect(response.setHeader).not.toHaveBeenCalledWith('content-encoding', expect.anything());
    expect(response.setHeader).not.toHaveBeenCalledWith('transfer-encoding', expect.anything());
    expect(response.end).toHaveBeenCalledOnce();
  });

  it('never calls AIProxy when administrator authorization fails', async () => {
    const error = new Error('unAuthorization');
    const response = createResponse();
    mocks.authSystemAdmin.mockRejectedValue(error);

    await handler({ query: {}, headers: {} } as any, response as any);

    expect(mocks.getAIProxyAdminConfig).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.jsonRes).toHaveBeenCalledWith(response, { code: 500, error });
  });

  it('rejects an empty proxy path without issuing an upstream request', async () => {
    const response = createResponse();

    await handler({ query: {}, headers: {} } as any, response as any);

    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.jsonRes).toHaveBeenCalledWith(
      response,
      expect.objectContaining({ code: 500, error: expect.any(Error) })
    );
  });
});
