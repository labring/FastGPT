import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { jsonRes } from '@fastgpt/service/common/response';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSandboxRuntimeSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  createSandboxPreviewFileUrl: vi.fn(),
  getFileInfo: vi.fn(),
  getSandboxClient: vi.fn(),
  resolveRuntimePath: vi.fn(),
  resolveSandboxPreviewPath: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/access', () => ({
  authSandboxRuntimeSession: mocks.authSandboxRuntimeSession
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/preview', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@fastgpt/service/core/ai/sandbox/application/preview')
  >()),
  createSandboxPreviewFileUrl: mocks.createSandboxPreviewFileUrl,
  resolveSandboxPreviewPath: mocks.resolveSandboxPreviewPath
}));

import handler from '@/pages/api/core/ai/sandbox/getHtmlPreviewLink';
import { SandboxPreviewSessionLimitError } from '@fastgpt/service/core/ai/sandbox/application/preview';

const mockJsonRes = vi.mocked(jsonRes);
const sandboxId = 'app-0123456789abcdef';

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
    mocks.authSandboxRuntimeSession.mockResolvedValue({
      uid: 'user-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011'
    });
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({
      sandboxId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011',
      userId: 'user-1',
      chatId: 'chat-1'
    });
    mocks.resolveRuntimePath.mockImplementation((filePath: string) =>
      filePath.startsWith('/') ? filePath : `/workspace/sessions/chat-1/${filePath}`
    );
    mocks.getFileInfo.mockResolvedValue(
      new Map([
        ['/workspace/sessions/chat-1/dist/index.html', { isDirectory: false, isFile: true }]
      ])
    );
    mocks.getSandboxClient.mockResolvedValue({
      resolveRuntimePath: mocks.resolveRuntimePath,
      provider: { getFileInfo: mocks.getFileInfo }
    });
    mocks.resolveSandboxPreviewPath.mockReturnValue({
      providerPath: '/workspace/sessions/chat-1/dist/index.html',
      relativePath: 'sessions/chat-1/dist/index.html'
    });
    mocks.createSandboxPreviewFileUrl.mockResolvedValue(
      'https://agent-proxy.example.com/preview/a12345678901234567890123/dist/index.html'
    );
  });

  it('returns a direct proxy URL without reading or uploading the HTML file', async () => {
    const req = createReq();
    const res = createRes();

    await handler(req, res);

    expect(mocks.authSandboxRuntimeSession).toHaveBeenCalledWith({
      req,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011',
      chatId: 'chat-1',
      outLinkAuthData: undefined,
      per: ReadPermissionVal
    });
    expect(mocks.resolveRuntimePath).toHaveBeenCalledWith('dist/index.html', {
      allowAbsolutePath: true
    });
    expect(mocks.resolveSandboxPreviewPath).toHaveBeenCalledWith(
      '/workspace/sessions/chat-1/dist/index.html'
    );
    expect(mocks.getFileInfo).toHaveBeenCalledWith(['/workspace/sessions/chat-1/dist/index.html']);
    expect(mocks.createSandboxPreviewFileUrl).toHaveBeenCalledWith({
      context: {
        sandboxId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: '507f1f77bcf86cd799439011',
        userId: 'user-1',
        chatId: 'chat-1'
      },
      filePath: '/workspace/sessions/chat-1/dist/index.html'
    });
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      data: 'https://agent-proxy.example.com/preview/a12345678901234567890123/dist/index.html'
    });
  });

  it.each([
    {
      target: { skillId: '507f1f77bcf86cd799439012' },
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: '507f1f77bcf86cd799439012'
    },
    {
      target: { appId: '507f1f77bcf86cd799439011', sourceType: ChatSourceTypeEnum.workflowBuilder },
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: '507f1f77bcf86cd799439011'
    },
    {
      target: { outLinkAuthData: { shareId: 'share-1', outLinkUid: 'visitor-1' } },
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'authorized-shared-app'
    }
  ])(
    'uses authorized $sourceType identity when creating preview sessions',
    async ({ target, sourceType, sourceId }) => {
      const req = {
        ...createReq(),
        body: { ...target, chatId: 'chat-1', filePath: 'dist/index.html' }
      } as any;
      mocks.authSandboxRuntimeSession.mockResolvedValueOnce({
        uid: 'authorized-owner',
        sourceType,
        sourceId
      });
      const query = {
        sandboxId,
        sourceType,
        sourceId,
        userId: 'authorized-owner',
        chatId: 'chat-1'
      };
      mocks.buildSandboxClientQueryFromChatSource.mockReturnValueOnce(query);
      await handler(req, createRes());
      expect(mocks.authSandboxRuntimeSession).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType,
          sourceId: 'outLinkAuthData' in target ? undefined : sourceId
        })
      );
      expect(mocks.buildSandboxClientQueryFromChatSource).toHaveBeenCalledExactlyOnceWith({
        sourceType,
        sourceId,
        userId: 'authorized-owner',
        chatId: 'chat-1'
      });
      expect(mocks.getSandboxClient).toHaveBeenCalledExactlyOnceWith(query);
      expect(mocks.createSandboxPreviewFileUrl).toHaveBeenCalledWith({
        context: query,
        filePath: '/workspace/sessions/chat-1/dist/index.html'
      });
    }
  );

  it('does not access a sandbox or issue a token when authorization fails', async () => {
    const error = new Error('unAuthChat');
    mocks.authSandboxRuntimeSession.mockRejectedValueOnce(error);
    await expect(handler(createReq(), createRes())).rejects.toBe(error);
    expect(mocks.buildSandboxClientQueryFromChatSource).not.toHaveBeenCalled();
    expect(mocks.getSandboxClient).not.toHaveBeenCalled();
    expect(mocks.getFileInfo).not.toHaveBeenCalled();
    expect(mocks.createSandboxPreviewFileUrl).not.toHaveBeenCalled();
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
      new Map([['/workspace/sessions/chat-1/dist/index.html', { isDirectory: true }]])
    );
    await handler(createReq(), directoryRes);
    expect(mockJsonRes).toHaveBeenNthCalledWith(2, directoryRes, {
      code: 400,
      message: 'HTML file does not exist'
    });

    const textRes = createRes();
    mocks.getFileInfo.mockResolvedValueOnce(
      new Map([
        ['/workspace/sessions/chat-1/dist/readme.txt', { isDirectory: false, isFile: true }]
      ])
    );
    await handler(createReq('dist/readme.txt'), textRes);
    expect(mockJsonRes).toHaveBeenNthCalledWith(3, textRes, {
      code: 400,
      message: 'File is not an HTML file'
    });
    expect(mocks.createSandboxPreviewFileUrl).not.toHaveBeenCalled();
  });

  it('returns 429 when the sandbox already has 500 active preview sessions', async () => {
    mocks.createSandboxPreviewFileUrl.mockRejectedValueOnce(new SandboxPreviewSessionLimitError());
    const res = createRes();

    await handler(createReq(), res);

    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 429,
      message: 'Too many active preview links for this sandbox'
    });
  });
});
