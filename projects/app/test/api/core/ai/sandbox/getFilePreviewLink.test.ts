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
  close: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@/service/core/sandbox/access', () => ({
  authSandboxRuntimeSession: mocks.authSandboxRuntimeSession
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime', () => ({
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/preview', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@fastgpt/service/core/ai/sandbox/application/preview')
  >()),
  createSandboxPreviewFileUrl: mocks.createSandboxPreviewFileUrl
}));
import handler from '@/pages/api/core/ai/sandbox/getFilePreviewLink';
import { SandboxPreviewSessionLimitError } from '@fastgpt/service/core/ai/sandbox/application/preview';
import { SANDBOX_PREVIEW_SESSION_TTL_SECONDS } from '@fastgpt/service/core/ai/sandbox/constants';

const mockJsonRes = vi.mocked(jsonRes);
const context = {
  sandboxId: 'app-0123456789abcdef',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: '507f1f77bcf86cd799439011',
  userId: 'user-1',
  chatId: 'chat-1'
};
const createReq = (filePath = 'dist/index.html') =>
  ({ body: { appId: context.sourceId, chatId: 'chat-1', filePath } }) as any;
const createRes = () => ({}) as any;
const url = 'https://agent-proxy.example.com/preview/a12345678901234567890123/dist/index.html';

describe('sandbox generic preview link API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSandboxRuntimeSession.mockResolvedValue({
      uid: 'user-1',
      sourceType: context.sourceType,
      sourceId: context.sourceId
    });
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue(context);
    mocks.close.mockResolvedValue(undefined);
    mocks.getSandboxClient.mockResolvedValue({
      close: mocks.close,
      recover: vi.fn(),
      opensandbox: { getFileInfo: mocks.getFileInfo },
      getRuntimePaths: () => ({ workspaceRoot: '/workspace' }),
      resolveRuntimePath: (path: string) =>
        path.startsWith('/') ? path : `/workspace/sessions/chat-1/${path}`
    });
    mocks.getFileInfo.mockImplementation(
      async ([path]) => new Map([[path, { path, type: 'file' }]])
    );
    mocks.createSandboxPreviewFileUrl.mockResolvedValue(url);
  });

  it.each([
    'dist/index.html',
    'media/image.png',
    'media/video.mp4',
    'docs/report.pdf',
    'docs/readme.txt'
  ])('issues a URL and expiration for %s without reading file contents', async (filePath) => {
    const req = createReq(filePath);
    const res = createRes();
    const before = Date.now();
    await handler(req, res);
    expect(mocks.authSandboxRuntimeSession).toHaveBeenCalledWith(
      expect.objectContaining({ req, per: ReadPermissionVal })
    );
    expect(mocks.createSandboxPreviewFileUrl).toHaveBeenCalledWith({
      context,
      relativePath: `sessions/chat-1/${filePath}`
    });
    expect(mockJsonRes).toHaveBeenCalledWith(res, { data: { url, expiresAt: expect.any(Number) } });
    const expiresAt = mockJsonRes.mock.calls.at(-1)![1].data.expiresAt;
    expect(expiresAt).toBeGreaterThanOrEqual(before + SANDBOX_PREVIEW_SESSION_TTL_SECONDS * 1000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + SANDBOX_PREVIEW_SESSION_TTL_SECONDS * 1000);
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each([
    {
      target: { skillId: '507f1f77bcf86cd799439012' },
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: '507f1f77bcf86cd799439012'
    },
    {
      target: { appId: context.sourceId, sourceType: ChatSourceTypeEnum.workflowBuilder },
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: context.sourceId
    },
    {
      target: { outLinkAuthData: { shareId: 'share-1', outLinkUid: 'visitor-1' } },
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'authorized-shared-app'
    }
  ])('uses authorized $sourceType identity', async ({ target, sourceType, sourceId }) => {
    mocks.authSandboxRuntimeSession.mockResolvedValueOnce({
      uid: 'authorized-owner',
      sourceType,
      sourceId
    });
    const query = { ...context, sourceType, sourceId, userId: 'authorized-owner' };
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValueOnce(query);
    await handler(
      { body: { ...target, chatId: 'chat-1', filePath: 'dist/index.html' } } as any,
      createRes()
    );
    expect(mocks.buildSandboxClientQueryFromChatSource).toHaveBeenCalledWith({
      sourceType,
      sourceId,
      userId: 'authorized-owner',
      chatId: 'chat-1'
    });
    expect(mocks.createSandboxPreviewFileUrl).toHaveBeenCalledWith(
      expect.objectContaining({ context: query })
    );
  });

  it('does not access a sandbox when auth fails', async () => {
    const error = new Error('unAuthChat');
    mocks.authSandboxRuntimeSession.mockRejectedValueOnce(error);
    await expect(handler(createReq(), createRes())).rejects.toBe(error);
    expect(mocks.getSandboxClient).not.toHaveBeenCalled();
    expect(mocks.createSandboxPreviewFileUrl).not.toHaveBeenCalled();
  });

  it.each([
    new Map(),
    new Map([
      [
        '/workspace/sessions/chat-1/dist/index.html',
        { path: '/workspace/sessions/chat-1/dist/index.html', type: 'directory' }
      ]
    ])
  ])('rejects a missing file or directory', async (info) => {
    mocks.getFileInfo.mockResolvedValueOnce(info);
    const res = createRes();
    await handler(createReq(), res);
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 400,
      message: 'Sandbox file does not exist'
    });
    expect(mocks.createSandboxPreviewFileUrl).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each(['/home/sandbox/notes.md', '/workspace'])(
    'returns 403 for a path outside the workspace (%s) before issuing a URL',
    async (forbiddenPath) => {
      const res = createRes();
      await handler(createReq(forbiddenPath), res);
      expect(mockJsonRes).toHaveBeenCalledWith(res, {
        code: 403,
        message: 'Sandbox file is outside the previewable directory'
      });
      expect(mocks.getFileInfo).not.toHaveBeenCalled();
      expect(mocks.createSandboxPreviewFileUrl).not.toHaveBeenCalled();
      expect(mocks.close).toHaveBeenCalledOnce();
    }
  );

  it('returns 429 when active link quota is reached', async () => {
    mocks.createSandboxPreviewFileUrl.mockRejectedValueOnce(new SandboxPreviewSessionLimitError());
    const res = createRes();
    await handler(createReq(), res);
    expect(mockJsonRes).toHaveBeenCalledWith(res, {
      code: 429,
      message: 'Too many active preview links for this sandbox'
    });
  });
});
