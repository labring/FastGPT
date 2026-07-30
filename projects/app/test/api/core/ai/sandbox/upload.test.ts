import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

const mocks = vi.hoisted(() => ({
  authSandboxRuntimeSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  createDirectories: vi.fn(),
  getAgentSandboxMaxFileBytes: vi.fn(),
  getSandboxClient: vi.fn(),
  writeFiles: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/access', () => ({
  authSandboxRuntimeSession: mocks.authSandboxRuntimeSession
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/config', () => ({
  getAgentSandboxMaxFileBytes: mocks.getAgentSandboxMaxFileBytes
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource,
  getSandboxClient: mocks.getSandboxClient
}));

import handler from '@/pages/api/core/ai/sandbox/upload';

const createReq = (headers: Record<string, string> = {}) =>
  Object.assign(Readable.from([new Uint8Array([1, 2]), new Uint8Array([3, 4])]), {
    body: undefined,
    query: {
      appId: '507f1f77bcf86cd799439011',
      chatId: 'chat-1',
      path: 'uploads/a.txt'
    },
    headers: {
      'content-type': 'application/octet-stream',
      'content-length': '4',
      ...headers
    }
  }) as any;

/** 消费 provider 收到的 Web Stream，验证路由传递的是实际文件字节。 */
const readWebStream = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
};

describe('sandbox upload API', () => {
  let uploadedContent: Buffer;

  beforeEach(() => {
    vi.clearAllMocks();
    uploadedContent = Buffer.alloc(0);
    mocks.getAgentSandboxMaxFileBytes.mockReturnValue(10 * 1024 * 1024);
    mocks.authSandboxRuntimeSession.mockResolvedValue({
      uid: 'user-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011'
    });
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({ sandboxId: 'sandbox-1' });
    mocks.writeFiles.mockImplementation(async ([entry]) => {
      uploadedContent = await readWebStream(entry.data);
      return [{ path: entry.path, bytesWritten: uploadedContent.length, error: null }];
    });
    mocks.getSandboxClient.mockResolvedValue({
      provider: {
        createDirectories: mocks.createDirectories,
        writeFiles: mocks.writeFiles
      },
      resolveRuntimePath: (path: string) => `/workspace/sessions/chat-1/${path}`
    });
  });

  it('streams the raw request body to the sandbox after write auth', async () => {
    const req = createReq();

    await expect(handler(req)).resolves.toEqual({
      path: 'uploads/a.txt',
      bytesWritten: 4
    });

    expect(mocks.authSandboxRuntimeSession).toHaveBeenCalledWith({
      req,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011',
      chatId: 'chat-1',
      outLinkAuthData: undefined,
      per: WritePermissionVal
    });
    expect(mocks.buildSandboxClientQueryFromChatSource).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011',
      userId: 'user-1',
      chatId: 'chat-1'
    });
    expect(mocks.createDirectories).toHaveBeenCalledWith(['/workspace/sessions/chat-1/uploads']);
    expect(mocks.writeFiles).toHaveBeenCalledWith([
      {
        path: '/workspace/sessions/chat-1/uploads/a.txt',
        data: expect.any(ReadableStream)
      }
    ]);
    expect(uploadedContent).toEqual(Buffer.from([1, 2, 3, 4]));
    expect(mocks.authSandboxRuntimeSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeFiles.mock.invocationCallOrder[0]
    );
    expect(mocks.createDirectories.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.writeFiles.mock.invocationCallOrder[0]
    );
  });

  it('rejects an oversized Content-Length before auth', async () => {
    mocks.getAgentSandboxMaxFileBytes.mockReturnValue(3);
    const req = createReq();

    await expect(handler(req)).rejects.toThrow('File is too large (4 bytes > 3 bytes)');

    expect(mocks.authSandboxRuntimeSession).not.toHaveBeenCalled();
    expect(mocks.writeFiles).not.toHaveBeenCalled();
  });
});
