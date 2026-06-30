import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

const mocks = vi.hoisted(() => ({
  authSandboxSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  clearDiskTempFiles: vi.fn(),
  getAgentSandboxMaxFileBytes: vi.fn(),
  getReadStream: vi.fn(),
  getSandboxClient: vi.fn(),
  resolveFormData: vi.fn(),
  writeFiles: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authSandboxSession: mocks.authSandboxSession,
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));

vi.mock('@fastgpt/service/common/file/multer', () => ({
  multer: {
    resolveFormData: mocks.resolveFormData,
    clearDiskTempFiles: mocks.clearDiskTempFiles
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/config', () => ({
  getAgentSandboxMaxFileBytes: mocks.getAgentSandboxMaxFileBytes
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

import handler from '@/pages/api/core/ai/sandbox/upload';

const createReq = () =>
  ({
    headers: {
      'content-type': 'multipart/form-data; boundary=test'
    }
  }) as any;

describe('sandbox upload API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAgentSandboxMaxFileBytes.mockReturnValue(10 * 1024 * 1024);
    mocks.getReadStream.mockReturnValue(Readable.from([new Uint8Array([1, 2, 3])]));
    mocks.resolveFormData.mockResolvedValue({
      data: {
        appId: '507f1f77bcf86cd799439011',
        chatId: 'chat-1',
        path: 'uploads/a.txt'
      },
      fileMetadata: {
        path: '/tmp/upload-a.txt',
        size: 3
      },
      getReadStream: mocks.getReadStream
    });
    mocks.authSandboxSession.mockResolvedValue({
      uid: 'user-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011'
    });
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({ sandboxId: 'sandbox-1' });
    mocks.writeFiles.mockResolvedValue([{ bytesWritten: 3, error: null }]);
    mocks.getSandboxClient.mockResolvedValue({ provider: { writeFiles: mocks.writeFiles } });
  });

  it('uploads multipart file through sandbox provider after write auth', async () => {
    const req = createReq();

    await expect(handler(req)).resolves.toEqual({
      path: 'uploads/a.txt',
      bytesWritten: 3
    });

    expect(mocks.resolveFormData).toHaveBeenCalledWith({
      request: req,
      maxFileSize: 10
    });
    expect(mocks.authSandboxSession).toHaveBeenCalledWith({
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
    expect(mocks.getSandboxClient).toHaveBeenCalledWith(
      { sandboxId: 'sandbox-1' },
      { failedArchivePolicy: 'clearAndContinue' }
    );
    expect(mocks.writeFiles).toHaveBeenCalledTimes(1);
    const [[writeEntry]] = mocks.writeFiles.mock.calls[0];
    expect(writeEntry.path).toBe('/workspace/uploads/a.txt');
    expect(writeEntry.data).toBeInstanceOf(ReadableStream);
    expect(mocks.clearDiskTempFiles).toHaveBeenCalledWith(['/tmp/upload-a.txt']);
  });
});
