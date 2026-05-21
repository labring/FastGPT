import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteMocks = vi.hoisted(() => ({
  deleteMarketplacePkg: vi.fn()
}));

vi.mock('../../../../../src/service/tool/delete', () => deleteMocks);
vi.mock('../../../../../src/service/auth', () => ({
  AUTH_TOKEN: 'marketplace-token'
}));

const createResponse = () => {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    writableFinished: false,
    setHeader: vi.fn(),
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((payload: unknown) => {
      res.body = payload;
      res.writableFinished = true;
      return res;
    }),
    end: vi.fn(() => {
      res.writableFinished = true;
      return res;
    })
  };

  return res;
};

describe('/api/admin/pkg/delete', () => {
  beforeEach(() => {
    deleteMocks.deleteMarketplacePkg.mockReset();
  });

  it('deletes a marketplace package by pluginId, version and source', async () => {
    deleteMocks.deleteMarketplacePkg.mockResolvedValue({
      pluginId: 'tool-a',
      version: '1.0.0',
      source: 'community'
    });

    const { default: handler } = await import('../../../../../src/pages/api/admin/pkg/delete');
    const res = createResponse();
    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer marketplace-token' },
        body: {
          pluginId: 'tool-a',
          version: '1.0.0',
          source: 'community'
        }
      } as any,
      res as any
    );

    expect(deleteMocks.deleteMarketplacePkg).toHaveBeenCalledWith({
      pluginId: 'tool-a',
      version: '1.0.0',
      source: 'community'
    });
    expect(res.body).toEqual({
      code: 200,
      data: {
        pluginId: 'tool-a',
        version: '1.0.0',
        source: 'community'
      }
    });
  });

  it('uses official source by default', async () => {
    deleteMocks.deleteMarketplacePkg.mockResolvedValue({
      pluginId: 'tool-a',
      version: '1.0.0',
      source: 'official'
    });

    const { default: handler } = await import('../../../../../src/pages/api/admin/pkg/delete');
    const res = createResponse();
    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer marketplace-token' },
        body: {
          pluginId: 'tool-a',
          version: '1.0.0'
        }
      } as any,
      res as any
    );

    expect(deleteMocks.deleteMarketplacePkg).toHaveBeenCalledWith({
      pluginId: 'tool-a',
      version: '1.0.0',
      source: 'official'
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects unauthorized requests', async () => {
    const { default: handler } = await import('../../../../../src/pages/api/admin/pkg/delete');
    const res = createResponse();
    await handler(
      {
        method: 'POST',
        headers: { authorization: 'bad-token' },
        body: {
          pluginId: 'tool-a',
          version: '1.0.0'
        }
      } as any,
      res as any
    );

    expect(deleteMocks.deleteMarketplacePkg).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      code: 401,
      message: 'Unauthorized'
    });
  });

  it('rejects unsupported methods', async () => {
    const { default: handler } = await import('../../../../../src/pages/api/admin/pkg/delete');
    const res = createResponse();
    await handler(
      {
        method: 'GET',
        headers: { authorization: 'Bearer marketplace-token' },
        body: {}
      } as any,
      res as any
    );

    expect(deleteMocks.deleteMarketplacePkg).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(405);
    expect(res.body).toEqual({
      code: 405,
      message: 'Method not allowed'
    });
  });
});
