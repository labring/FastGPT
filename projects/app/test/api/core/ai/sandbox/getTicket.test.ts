import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  authSandboxRuntimeSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  getSandboxClient: vi.fn(),
  createDirectories: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/core/sandbox/access', () => ({
  authSandboxRuntimeSession: mocks.authSandboxRuntimeSession
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource,
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    AGENT_SANDBOX_PROXY_SECRET: 'ticket-secret'
  }
}));

import handler from '@/pages/api/core/ai/sandbox/getTicket';

describe('sandbox getTicket API', () => {
  const appId = '64f000000000000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSandboxRuntimeSession.mockResolvedValue({
      uid: 'user-1',
      teamId: 'team-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId
    });
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({
      sandboxId: 'user-sandbox-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: 'user-1',
      chatId: 'chat-1'
    });
    mocks.createDirectories.mockResolvedValue(undefined);
    mocks.getSandboxClient.mockResolvedValue({
      provider: {
        createDirectories: mocks.createDirectories
      },
      getRuntimePaths: () => ({
        workspaceRoot: '/workspace',
        runtimeSkillsRoot: '/workspace/projects',
        sessionWorkDirectory: '/workspace/sessions/chat-1'
      })
    });
  });

  it('returns the proxy ticket and current Chat runtime roots', async () => {
    const result = await handler({
      body: {
        appId,
        chatId: 'chat-1',
        channel: 'fs',
        permission: 'write'
      }
    } as any);

    expect(result).toMatchObject({
      ticket: expect.any(String),
      workspaceRoot: '/workspace',
      sessionWorkDirectory: '/workspace/sessions/chat-1'
    });
    expect(mocks.authSandboxRuntimeSession).toHaveBeenCalledOnce();
    expect(mocks.getSandboxClient).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'user-sandbox-1', chatId: 'chat-1' })
    );
    expect(mocks.createDirectories).toHaveBeenCalledWith(['/workspace/sessions/chat-1']);
  });

  it('does not issue a ticket when the current Chat directory cannot be prepared', async () => {
    mocks.createDirectories.mockRejectedValueOnce(new Error('mkdir failed'));

    await expect(
      handler({
        body: {
          appId,
          chatId: 'chat-1',
          channel: 'fs'
        }
      } as any)
    ).rejects.toThrow('mkdir failed');
  });
});
