import { beforeEach, describe, expect, it, vi } from 'vitest';

const uploadMocks = vi.hoisted(() => ({
  uploadMarketplacePkg: vi.fn()
}));

const multerMocks = vi.hoisted(() => ({
  resolveFormData: vi.fn(),
  clearDiskTempFiles: vi.fn()
}));

vi.mock('../../../../../src/service/tool/upload', () => uploadMocks);
vi.mock('@fastgpt/service/common/file/multer', () => ({
  multer: multerMocks
}));
vi.mock('../../../../../src/service/auth', () => ({
  AUTH_TOKEN: 'marketplace-token',
  COMMUNITY_AUTH_TOKEN: 'community-token',
  authenticateSubmitToken: vi.fn((authorization: string | undefined) => {
    if (authorization === 'Bearer marketplace-token') return { source: 'official' };
    if (authorization === 'Bearer community-token') return { source: 'community' };
    return null;
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

const mockUploadForm = (data: Record<string, unknown> = {}) => {
  multerMocks.resolveFormData.mockResolvedValue({
    fileMetadata: {
      path: '/tmp/tool.pkg'
    },
    data,
    getBuffer: () => Buffer.from('pkg')
  });
};

describe('/api/admin/pkg/upload', () => {
  beforeEach(() => {
    uploadMocks.uploadMarketplacePkg.mockReset();
    multerMocks.resolveFormData.mockReset();
    multerMocks.clearDiskTempFiles.mockReset();
  });

  it('uploads official package when official token is used', async () => {
    mockUploadForm();
    uploadMocks.uploadMarketplacePkg.mockResolvedValue({
      pluginId: 'tool-a',
      version: '1.0.0',
      etag: 'etag-1',
      source: 'official',
      downloadUrl: 'https://cdn.example.com/tool-a.pkg',
      tool: {}
    });

    const { default: handler } = await import('../../../../../src/pages/api/admin/pkg/upload');
    const res = createResponse();
    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer marketplace-token' }
      } as any,
      res as any
    );

    expect(uploadMocks.uploadMarketplacePkg).toHaveBeenCalledWith({
      buffer: Buffer.from('pkg'),
      source: 'official'
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      code: 200,
      data: {
        pluginId: 'tool-a',
        version: '1.0.0',
        etag: 'etag-1',
        source: 'official',
        downloadUrl: 'https://cdn.example.com/tool-a.pkg',
        tool: {}
      }
    });
  });

  it('uploads community package when community token is used and ignores submitted source', async () => {
    mockUploadForm({ source: 'official' });
    uploadMocks.uploadMarketplacePkg.mockResolvedValue({
      pluginId: 'tool-a',
      version: '1.0.0',
      etag: 'etag-1',
      source: 'community',
      downloadUrl: 'https://cdn.example.com/tool-a.pkg',
      tool: {}
    });

    const { default: handler } = await import('../../../../../src/pages/api/admin/pkg/upload');
    const res = createResponse();
    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer community-token' }
      } as any,
      res as any
    );

    expect(uploadMocks.uploadMarketplacePkg).toHaveBeenCalledWith({
      buffer: Buffer.from('pkg'),
      source: 'community'
    });
    expect(res.body).toEqual({
      code: 200,
      data: expect.objectContaining({
        source: 'community'
      })
    });
  });

  it('rejects unauthorized upload before parsing form data', async () => {
    const { default: handler } = await import('../../../../../src/pages/api/admin/pkg/upload');
    const res = createResponse();
    await handler(
      {
        method: 'POST',
        headers: { authorization: 'Bearer bad-token' }
      } as any,
      res as any
    );

    expect(multerMocks.resolveFormData).not.toHaveBeenCalled();
    expect(uploadMocks.uploadMarketplacePkg).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({
      code: 401,
      message: 'Unauthorized'
    });
  });
});
