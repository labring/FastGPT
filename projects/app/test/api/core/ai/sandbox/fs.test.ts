import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

const mocks = vi.hoisted(() => ({
  authSandboxRuntimeSession: vi.fn(),
  getSandboxClient: vi.fn(),
  listSandboxSessionDirectory: vi.fn()
}));
vi.mock('@/service/middleware/entry', () => ({ NextAPI: vi.fn((handler) => handler) }));
vi.mock('@/service/core/sandbox/access', () => ({
  authSandboxRuntimeSession: mocks.authSandboxRuntimeSession
}));
vi.mock('@fastgpt/service/core/ai/sandbox/config', () => ({
  getAgentSandboxMaxFileBytes: () => 10 * 1024 * 1024
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime', () => ({
  buildSandboxClientQueryFromChatSource: vi.fn()
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/file', () => ({
  listSandboxSessionDirectory: mocks.listSandboxSessionDirectory
}));
import listHandler from '@/pages/api/core/ai/sandbox/fs/list';

const appId = '507f1f77bcf86cd799439011';
describe('sandbox fs list API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSandboxRuntimeSession.mockResolvedValue({
      uid: 'user-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId
    });
    mocks.getSandboxClient.mockResolvedValue({
      close: vi.fn(async () => undefined),
      recover: vi.fn(),
      opensandbox: {},
      getRuntimePaths: () => ({
        workspaceRoot: '/workspace',
        runtimeSkillsRoot: '/workspace/projects',
        sessionWorkDirectory: '/workspace/sessions/chat-1'
      })
    });
  });
  it('lists directory with read permission and returns paths and file quota', async () => {
    mocks.listSandboxSessionDirectory.mockResolvedValueOnce([
      { name: 'index.ts', path: 'index.ts', type: 'file', size: 100 }
    ]);
    const result = await listHandler({ body: { appId, chatId: 'chat-1', path: '.' } } as any);
    expect(mocks.authSandboxRuntimeSession).toHaveBeenCalledWith(
      expect.objectContaining({ per: ReadPermissionVal })
    );
    expect(result).toEqual({
      entries: [{ name: 'index.ts', path: 'index.ts', type: 'file', size: 100 }],
      maxFileBytes: 10 * 1024 * 1024,
      sessionWorkDirectory: '/workspace/sessions/chat-1'
    });
  });
});
