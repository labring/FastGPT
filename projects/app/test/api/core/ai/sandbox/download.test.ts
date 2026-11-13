import { PassThrough } from 'node:stream';
import type { NextApiResponse } from 'next';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { SandboxFileNotFoundError } from '@fastgpt/service/core/ai/sandbox/application/file';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readSandboxSessionDirectoryArchive: vi.fn(),
  isSandboxPathDirectory: vi.fn(),
  readSandboxSessionFile: vi.fn(),
  authSandboxRuntimeSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  getSandboxClient: vi.fn(),
  jsonRes: vi.fn(),
  close: vi.fn(),
  archiveCleanup: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));
vi.mock('@fastgpt/service/common/response', () => ({
  jsonRes: mocks.jsonRes
}));

vi.mock('@/service/core/sandbox/access', () => ({
  authSandboxRuntimeSession: mocks.authSandboxRuntimeSession
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime', () => ({
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@fastgpt/service/core/ai/sandbox/application/runtime/client')
  >()),
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/file', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/application/file')>()),
  readSandboxSessionDirectoryArchive: mocks.readSandboxSessionDirectoryArchive,
  isSandboxPathDirectory: mocks.isSandboxPathDirectory,
  readSandboxSessionFile: mocks.readSandboxSessionFile
}));

import handler from '@/pages/api/core/ai/sandbox/download';

const appId = '507f1f77bcf86cd799439011';

describe('sandbox download API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.close.mockResolvedValue(undefined);
    mocks.archiveCleanup.mockResolvedValue(undefined);
    mocks.authSandboxRuntimeSession.mockResolvedValue({
      uid: 'user-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId
    });
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({ sandboxId: 'sandbox-1' });
    mocks.getSandboxClient.mockResolvedValue({
      close: mocks.close,
      recover: vi.fn()
    });
  });

  it('streams a directory zip archive through handler and always cleans up temp zip', async () => {
    mocks.isSandboxPathDirectory.mockResolvedValueOnce(true);
    mocks.readSandboxSessionDirectoryArchive.mockResolvedValueOnce({
      stream: (async function* () {
        yield new Uint8Array([80, 75, 5, 6]);
      })(),
      size: 4,
      cleanup: mocks.archiveCleanup
    });

    const stream = new PassThrough();
    const headers = new Map<string, string>();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    const res = Object.assign(stream, {
      setHeader: vi.fn((key: string, value: string) => headers.set(key.toLowerCase(), value))
    }) as unknown as NextApiResponse;

    await handler({ method: 'POST', body: { appId, chatId: 'chat-1', path: '.' } } as any, res);

    expect(headers.get('content-type')).toBe('application/zip');
    expect(headers.get('content-disposition')).toContain('workspace-');
    expect(headers.get('content-length')).toBe('4');
    expect(mocks.readSandboxSessionDirectoryArchive).toHaveBeenCalledWith(expect.anything(), '.');
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([80, 75, 5, 6]));
    expect(mocks.archiveCleanup).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('streams a single file with ETag, Content-Length, no-store headers, and closes the client', async () => {
    mocks.isSandboxPathDirectory.mockResolvedValueOnce(false);
    mocks.readSandboxSessionFile.mockResolvedValueOnce({
      stream: (async function* () {
        yield new Uint8Array([0, 255, 65]);
      })(),
      fileName: 'binary.bin',
      etag: 'W/"3-1700000000000"',
      size: 3
    });

    const stream = new PassThrough();
    const headers = new Map<string, string>();
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    const res = Object.assign(stream, {
      setHeader: vi.fn((key: string, value: string) => {
        headers.set(key.toLowerCase(), value);
      })
    }) as unknown as NextApiResponse;

    await handler(
      {
        method: 'POST',
        body: {
          appId,
          chatId: 'chat-1',
          path: 'dir/binary.bin'
        }
      } as any,
      res
    );

    expect(mocks.authSandboxRuntimeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        per: ReadPermissionVal
      })
    );
    expect(headers.get('content-type')).toBe('application/octet-stream');
    expect(headers.get('cache-control')).toBe('no-store');
    expect(headers.get('etag')).toBe('W/"3-1700000000000"');
    expect(headers.get('content-length')).toBe('3');
    expect(headers.get('content-disposition')).toContain('binary.bin');
    expect(Buffer.concat(chunks)).toEqual(Buffer.from([0, 255, 65]));
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it('responds with 404 UserError when single file does not exist and rejects non-POST methods with 405', async () => {
    const res405 = { setHeader: vi.fn() } as unknown as NextApiResponse;
    await handler({ method: 'GET' } as any, res405);
    expect(res405.setHeader).toHaveBeenCalledWith('Allow', 'POST');
    expect(mocks.jsonRes).toHaveBeenCalledWith(res405, {
      code: 405,
      message: 'Method Not Allowed'
    });

    mocks.jsonRes.mockClear();
    mocks.isSandboxPathDirectory.mockResolvedValueOnce(false);
    mocks.readSandboxSessionFile.mockRejectedValueOnce(new SandboxFileNotFoundError());
    const res404 = { headersSent: false, setHeader: vi.fn() } as unknown as NextApiResponse;

    await handler(
      {
        method: 'POST',
        body: {
          appId,
          chatId: 'chat-1',
          path: 'deleted.txt'
        }
      } as any,
      res404
    );

    expect(mocks.jsonRes).toHaveBeenCalledWith(res404, {
      code: 404,
      error: expect.any(UserError)
    });
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
