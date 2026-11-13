import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { SandboxFileConflictError } from '@fastgpt/service/core/ai/sandbox/application/file';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

const mocks = vi.hoisted(() => ({
  authSandboxRuntimeSession: vi.fn(),
  getSandboxClient: vi.fn(),
  writeSandboxSessionFile: vi.fn(),
  getAgentSandboxMaxFileBytes: vi.fn(),
  jsonRes: vi.fn(),
  close: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@fastgpt/service/common/response', () => ({ jsonRes: mocks.jsonRes }));
vi.mock('@/service/core/sandbox/access', () => ({
  authSandboxRuntimeSession: mocks.authSandboxRuntimeSession
}));
vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
  getAgentSandboxMaxFileBytes: mocks.getAgentSandboxMaxFileBytes
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient,
  isRecoverableSandboxError: () => false
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/file', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/application/file')>();
  return {
    ...actual,
    writeSandboxSessionFile: mocks.writeSandboxSessionFile
  };
});
import handler, { config } from '@/pages/api/core/ai/sandbox/upload';

const createReq = (
  bytes = Buffer.from([0, 255, 128, 1]),
  headers: Record<string, string> = {},
  method = 'POST'
) =>
  Object.assign(Readable.from([bytes]), {
    method,
    query: {
      appId: '507f1f77bcf86cd799439011',
      chatId: 'chat-1',
      path: 'uploads/a.bin',
      oldEtag: 'W/"4-1"'
    },
    headers: { 'content-type': 'application/octet-stream', ...headers }
  }) as any;

const createRes = () =>
  ({
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn()
  }) as any;

describe('sandbox unified upload API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSandboxRuntimeSession.mockResolvedValue({
      uid: 'user-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011'
    });
    mocks.getAgentSandboxMaxFileBytes.mockReturnValue(10 * 1024 * 1024);
    mocks.close.mockResolvedValue(undefined);
    mocks.getSandboxClient.mockResolvedValue({
      close: mocks.close,
      recover: vi.fn(),
      opensandbox: {}
    });
  });

  it.each([0, 4, 900 * 1024, 5 * 1024 * 1024])(
    'passes %i raw bytes and the old version without JSON/Base64 body parsing',
    async (size) => {
      const bytes = Buffer.alloc(size, 0xff);
      let received = Buffer.alloc(0);
      mocks.writeSandboxSessionFile.mockImplementationOnce(async (_sandbox, { stream }) => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(chunk);
        received = Buffer.concat(chunks);
        return { bytesWritten: received.length, etag: 'saved-version' };
      });
      const req = createReq(bytes);
      await expect(handler(req, createRes())).resolves.toEqual({
        path: 'uploads/a.bin',
        bytesWritten: size,
        etag: 'saved-version'
      });
      expect(received).toEqual(bytes);
      expect(config.api.bodyParser).toBe(false);
      expect(mocks.authSandboxRuntimeSession).toHaveBeenCalledWith(
        expect.objectContaining({ req, per: WritePermissionVal })
      );
      expect(mocks.writeSandboxSessionFile).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          path: 'uploads/a.bin',
          stream: req,
          oldEtag: 'W/"4-1"',
          maxFileBytes: 10 * 1024 * 1024,
          signal: expect.any(AbortSignal)
        })
      );
      expect(mocks.close).toHaveBeenCalledOnce();
    }
  );

  it('rejects oversized Content-Length before auth while actual stream limiting stays in the service', async () => {
    mocks.getAgentSandboxMaxFileBytes.mockReturnValue(3);
    await expect(
      handler(createReq(undefined, { 'content-length': '4' }), createRes())
    ).rejects.toThrow('File is too large');
    expect(mocks.authSandboxRuntimeSession).not.toHaveBeenCalled();
    expect(mocks.writeSandboxSessionFile).not.toHaveBeenCalled();
  });

  it('responds with 409 UserError on SandboxFileConflictError and closes the provider', async () => {
    const conflict = new SandboxFileConflictError('File has been modified concurrently');
    const res = createRes();
    mocks.writeSandboxSessionFile.mockRejectedValueOnce(conflict);

    await expect(handler(createReq(), res)).resolves.toBeUndefined();
    expect(mocks.jsonRes).toHaveBeenCalledWith(res, {
      code: 409,
      error: expect.any(UserError)
    });
    expect(mocks.jsonRes.mock.calls[0][1].error.message).toBe(
      'File has been modified concurrently'
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('rethrows unexpected write errors while still closing the provider', async () => {
    const error = new Error('Storage backend disconnected');
    mocks.writeSandboxSessionFile.mockRejectedValueOnce(error);

    await expect(handler(createReq(), createRes())).rejects.toBe(error);
    expect(mocks.jsonRes).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('signals an aborted request to the staged writer and removes its listener', async () => {
    const req = createReq();
    mocks.writeSandboxSessionFile.mockImplementationOnce(async (_sandbox, { signal }) => {
      req.emit('aborted');
      signal.throwIfAborted();
    });
    await expect(handler(req, createRes())).rejects.toThrow('upload aborted');
    expect(req.listenerCount('aborted')).toBe(0);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each(['GET', 'HEAD', 'PUT'])(
    'rejects non-POST method %s with 405 before auth or truncating files',
    async (method) => {
      const res = createRes();
      await handler(createReq(Buffer.alloc(0), {}, method), res);
      expect(res.setHeader).toHaveBeenCalledWith('Allow', 'POST');
      expect(mocks.jsonRes).toHaveBeenCalledWith(res, {
        code: 405,
        message: 'Method Not Allowed'
      });
      expect(mocks.authSandboxRuntimeSession).not.toHaveBeenCalled();
      expect(mocks.writeSandboxSessionFile).not.toHaveBeenCalled();
    }
  );
});
