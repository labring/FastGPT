import { beforeEach, describe, expect, it, vi } from 'vitest';

const dataMocks = vi.hoisted(() => ({
  getToolList: vi.fn()
}));

const s3Mocks = vi.hoisted(() => ({
  getPkgdownloadURL: vi.fn((toolId: string) => `https://fallback.example.com/${toolId}.pkg`)
}));

const downloadMocks = vi.hoisted(() => ({
  increaseDownloadCount: vi.fn()
}));

vi.mock('../../../../src/service/tool/data', () => dataMocks);
vi.mock('../../../../src/service/s3', () => s3Mocks);
vi.mock('../../../../src/service/downloadCount', () => downloadMocks);
vi.mock('../../../../src/service/logger', () => ({
  LogCategories: {
    MODULE: {
      API: 'api'
    }
  },
  getLogger: () => ({
    error: vi.fn()
  })
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

describe('/api/tool/getDownloadUrl', () => {
  beforeEach(() => {
    dataMocks.getToolList.mockReset();
    s3Mocks.getPkgdownloadURL.mockClear();
    downloadMocks.increaseDownloadCount.mockReset();
  });

  it('uses requested version when downloading a specific tool', async () => {
    dataMocks.getToolList.mockResolvedValue([
      {
        toolId: 'tool-a',
        version: '2.0.0',
        downloadUrl: 'https://cdn.example.com/tool-a/2.0.0.pkg'
      }
    ]);

    const { default: handler } = await import('../../../../src/pages/api/tool/getDownloadUrl');
    const res = createResponse();
    await handler(
      {
        method: 'GET',
        query: { toolId: 'tool-a', version: '2.0.0' },
        body: {}
      } as any,
      res as any
    );

    expect(dataMocks.getToolList).toHaveBeenCalledWith({ toolId: 'tool-a', version: '2.0.0' });
    expect(downloadMocks.increaseDownloadCount).toHaveBeenCalledWith('tool-a', 'tool');
    expect(res.body).toEqual({
      code: 200,
      data: 'https://cdn.example.com/tool-a/2.0.0.pkg'
    });
  });

  it('uses parent tool id when versioned download targets a child tool', async () => {
    dataMocks.getToolList.mockResolvedValue([
      {
        toolId: 'tool-a/child',
        version: '2.0.0',
        downloadUrl: 'https://cdn.example.com/tool-a/2.0.0.pkg'
      }
    ]);

    const { default: handler } = await import('../../../../src/pages/api/tool/getDownloadUrl');
    const res = createResponse();
    await handler(
      {
        method: 'GET',
        query: { toolId: 'tool-a/child', version: '2.0.0' },
        body: {}
      } as any,
      res as any
    );

    expect(dataMocks.getToolList).toHaveBeenCalledWith({ toolId: 'tool-a', version: '2.0.0' });
    expect(res.body).toEqual({
      code: 200,
      data: 'https://cdn.example.com/tool-a/2.0.0.pkg'
    });
  });

  it('rejects missing versioned tool instead of falling back to latest URL', async () => {
    dataMocks.getToolList.mockResolvedValue([]);

    const { default: handler } = await import('../../../../src/pages/api/tool/getDownloadUrl');
    const res = createResponse();
    await handler(
      {
        method: 'GET',
        query: { toolId: 'tool-a', version: '9.9.9' },
        body: {}
      } as any,
      res as any
    );

    expect(s3Mocks.getPkgdownloadURL).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      code: 500,
      message: 'tool not found'
    });
  });

  it('keeps legacy fallback when no version is requested', async () => {
    dataMocks.getToolList.mockResolvedValue([]);

    const { default: handler } = await import('../../../../src/pages/api/tool/getDownloadUrl');
    const res = createResponse();
    await handler(
      {
        method: 'GET',
        query: { toolId: 'tool-a' },
        body: {}
      } as any,
      res as any
    );

    expect(dataMocks.getToolList).toHaveBeenCalledWith();
    expect(res.body).toEqual({
      code: 200,
      data: 'https://fallback.example.com/tool-a.pkg'
    });
  });

  it('returns a URL list and counts downloads for batch requests', async () => {
    dataMocks.getToolList.mockResolvedValue([
      { toolId: 'tool-a', downloadUrl: 'https://cdn.example.com/tool-a.pkg' },
      { toolId: 'tool-b' },
      { toolId: 'tool-c', downloadUrl: 'https://cdn.example.com/tool-c.pkg' }
    ]);

    const { default: handler } = await import('../../../../src/pages/api/tool/getDownloadUrl');
    const res = createResponse();
    await handler(
      {
        method: 'POST',
        query: {},
        body: { toolIds: ['tool-a', 'tool-b'] }
      } as any,
      res as any
    );

    expect(downloadMocks.increaseDownloadCount).toHaveBeenCalledTimes(2);
    expect(res.body).toEqual({
      code: 200,
      data: ['https://cdn.example.com/tool-a.pkg', 'https://fallback.example.com/tool-b.pkg']
    });
  });
});
