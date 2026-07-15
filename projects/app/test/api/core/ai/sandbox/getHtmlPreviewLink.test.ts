import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { jsonRes } from '@fastgpt/service/common/response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSandboxSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  createSandboxPreviewFileUrl: vi.fn(),
  getFileInfo: vi.fn(),
  getSandboxClient: vi.fn(),
  resolveSandboxPreviewPath: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authSandboxSession: mocks.authSandboxSession,
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/preview', () => ({
  createSandboxPreviewFileUrl: mocks.createSandboxPreviewFileUrl,
  resolveSandboxPreviewPath: mocks.resolveSandboxPreviewPath
}));

import handler from '@/pages/api/core/ai/sandbox/getHtmlPreviewLink';

const mockJsonRes = vi.mocked(jsonRes);

const createReq = (filePath = 'dist/index.html') =>
  ({
    body: {
      appId: '507f1f77bcf86cd799439011',
      chatId: 'chat-1',
      filePath
    }
  }) as any;

const createRes = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res as any;
};

describe('sandbox getHtmlPreviewLink API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSandboxSession.mockResolvedValue({
      uid: 'user-1',
      teamId: 'team-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011'
    });
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({ sandboxId: 'sandbox-1' });
    mocks.resolveSandboxPreviewPath.mockReturnValue({
      providerPath: '/workspace/dist/index.html',
      relativePath: 'dist/index.html'
    });
    mocks.getFileInfo.mockResolvedValue(
      new Map([['/workspace/dist/index.html', { isDirectory: false, isFile: true }]])
    );
    mocks.getSandboxClient.mockResolvedValue({ provider: { getFileInfo: mocks.getFileInfo } });
    mocks.createSandboxPreviewFileUrl.mockReturnValue(
      'https://agent-proxy.example.com/preview/ticket/dist/index.html'
    );
  });

  it('returns a direct proxy URL without reading or uploading the HTML file', async () => {
    const req = createReq();
    const res = createRes();

    await handler(req, res);

    expect(mocks.authSandboxSession).toHaveBeenCalledWith({
      req,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011',
      chatId: 'chat-1',
      outLinkAuthData: undefined,
      per: ReadPermissionVal
    });
    expect(mocks.getFileInfo).toHaveBeenCalledWith(['/workspace/dist/index.html']);
    expect(mocks.createSandboxPreviewFileUrl).toHaveBeenCalledWith({
      context: {
        sourceType: ChatSourceTypeEnum.app,
        sourceId: '507f1f77bcf86cd799439011',
        userId: 'user-1',
        chatId: 'chat-1',
        teamId: 'team-1'
      },
      filePath: '/workspace/dist/index.html'
    });
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      data: 'https://agent-proxy.example.com/preview/ticket/dist/index.html'
    });
  });

  it('rejects missing files, directories and non-HTML file extensions', async () => {
    const missingRes = createRes();
    mocks.getFileInfo.mockResolvedValueOnce(new Map());
    await handler(createReq(), missingRes);
    expect(mockJsonRes).toHaveBeenNthCalledWith(1, missingRes, {
      code: 400,
      message: 'HTML file does not exist'
    });

    const directoryRes = createRes();
    mocks.getFileInfo.mockResolvedValueOnce(
      new Map([['/workspace/dist/index.html', { isDirectory: true }]])
    );
    await handler(createReq(), directoryRes);
    expect(mockJsonRes).toHaveBeenNthCalledWith(2, directoryRes, {
      code: 400,
      message: 'HTML file does not exist'
    });

    const textRes = createRes();
    mocks.resolveSandboxPreviewPath.mockReturnValueOnce({
      providerPath: '/workspace/dist/readme.txt',
      relativePath: 'dist/readme.txt'
    });
    mocks.getFileInfo.mockResolvedValueOnce(
      new Map([['/workspace/dist/readme.txt', { isDirectory: false, isFile: true }]])
    );
    await handler(createReq('dist/readme.txt'), textRes);
    expect(mockJsonRes).toHaveBeenNthCalledWith(3, textRes, {
      code: 400,
      message: 'File is not an HTML file'
    });
    expect(mocks.createSandboxPreviewFileUrl).not.toHaveBeenCalled();
  });
});
