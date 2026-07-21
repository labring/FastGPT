import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  authSandboxSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  getSandboxClient: vi.fn(),
  execute: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authSandboxSession: mocks.authSandboxSession,
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
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
    mocks.authSandboxSession.mockResolvedValue({
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
    mocks.execute.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 });
    mocks.getSandboxClient.mockResolvedValue({
      provider: {
        execute: mocks.execute
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
    expect(mocks.getSandboxClient).toHaveBeenCalledWith(
      expect.objectContaining({ sandboxId: 'user-sandbox-1', chatId: 'chat-1' })
    );
    expect(mocks.execute).toHaveBeenCalledWith("mkdir -p '/workspace/sessions/chat-1'", {
      timeoutMs: 30_000
    });
  });

  it('does not issue a ticket when the current Chat directory cannot be prepared', async () => {
    mocks.execute.mockResolvedValueOnce({
      stdout: '',
      stderr: 'mkdir failed',
      exitCode: 1
    });

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
