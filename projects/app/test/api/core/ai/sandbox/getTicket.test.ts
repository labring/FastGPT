import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import jwt from 'jsonwebtoken';
import type { SandboxGetTicketResponse } from '@fastgpt/global/openapi/core/ai/sandbox/api';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';

const mocks = vi.hoisted(() => ({
  authSandboxRuntimeSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  getSandboxClient: vi.fn(),
  createDirectories: vi.fn(),
  env: {
    AGENT_SANDBOX_PROXY_SECRET: 'ticket-secret' as string | undefined,
    AGENT_SANDBOX_PROXY_URL: 'wss://proxy.example.com' as string | undefined,
    AGENT_SANDBOX_STORAGE_SIZE_GI: 1
  }
}));

vi.mock('@/service/middleware/entry', () => ({ NextAPI: (handler: unknown) => handler }));
vi.mock('@/service/core/sandbox/access', () => ({
  authSandboxRuntimeSession: mocks.authSandboxRuntimeSession
}));
vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));
vi.mock('@fastgpt/service/env', () => ({ serviceEnv: mocks.env }));

import handler from '@/pages/api/core/ai/sandbox/getTicket';

describe('sandbox getTicket API', () => {
  const appId = '64f000000000000000000001';
  const invoke = (body: Record<string, unknown>) =>
    handler({ body } as any, {} as any) as Promise<SandboxGetTicketResponse>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.AGENT_SANDBOX_PROXY_SECRET = 'ticket-secret';
    mocks.env.AGENT_SANDBOX_PROXY_URL = 'wss://proxy.example.com';
    mocks.env.AGENT_SANDBOX_STORAGE_SIZE_GI = 1;
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
      provider: { createDirectories: mocks.createDirectories },
      getRuntimePaths: () => ({
        workspaceRoot: '/workspace',
        runtimeSkillsRoot: '/workspace/projects',
        sessionWorkDirectory: '/workspace/sessions/chat-1'
      })
    });
  });

  it.each([
    {
      channel: 'fs',
      permission: undefined,
      expectedPermission: 'read',
      target: 'appId',
      proxy: 'wss://proxy.example.com',
      path: '/fs'
    },
    {
      channel: 'fs',
      permission: 'write',
      expectedPermission: 'write',
      target: 'appId',
      proxy: 'ws://proxy.example.com/prefix///',
      path: '/prefix/fs'
    },
    {
      channel: 'terminal',
      permission: 'read',
      expectedPermission: 'write',
      target: 'skillId',
      proxy: 'wss://proxy.example.com/prefix/',
      path: '/prefix/terminal'
    }
  ] as const)(
    'returns a $channel URL with the resolved identity, permission and authoritative file limit',
    async (scenario) => {
      const sourceType =
        scenario.target === 'skillId' ? ChatSourceTypeEnum.skillEdit : ChatSourceTypeEnum.app;
      mocks.env.AGENT_SANDBOX_PROXY_URL = scenario.proxy;
      mocks.authSandboxRuntimeSession.mockResolvedValueOnce({
        uid: 'user-1',
        teamId: 'team-1',
        sourceType,
        sourceId: appId
      });
      const result = await invoke({
        [scenario.target]: appId,
        chatId: 'chat-1',
        channel: scenario.channel,
        ...(scenario.permission && { permission: scenario.permission })
      });
      const url = new URL(result.wsUrl);
      const ticket = url.searchParams.get('ticket')!;
      const payload = jwt.verify(ticket, 'ticket-secret') as jwt.JwtPayload;

      expect(result).toEqual({
        wsUrl: expect.any(String),
        maxFileBytes: 362 * 1024 ** 2,
        workspaceRoot: '/workspace',
        sessionWorkDirectory: '/workspace/sessions/chat-1'
      });
      expect(url.origin).toBe(new URL(scenario.proxy).origin);
      expect(url.pathname).toBe(scenario.path);
      expect(payload).toMatchObject({
        sourceType,
        sourceId: appId,
        userId: 'user-1',
        chatId: 'chat-1',
        teamId: 'team-1',
        channel: scenario.channel,
        permission: scenario.expectedPermission
      });
      expect(payload.exp! - payload.iat!).toBe(60);
      expect(mocks.authSandboxRuntimeSession).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          per: scenario.expectedPermission === 'write' ? WritePermissionVal : ReadPermissionVal
        })
      );
      expect(mocks.getSandboxClient).toHaveBeenCalledWith(
        expect.objectContaining({ sandboxId: 'user-sandbox-1', chatId: 'chat-1' })
      );
      expect(mocks.createDirectories).toHaveBeenCalledWith(['/workspace/sessions/chat-1']);
    }
  );

  it('rejects terminal access outside skill edit sessions before authentication', async () => {
    await expect(invoke({ appId, chatId: 'chat-1', channel: 'terminal' })).rejects.toThrow(
      'only available'
    );
    expect(mocks.authSandboxRuntimeSession).not.toHaveBeenCalled();
  });

  it.each(['AGENT_SANDBOX_PROXY_SECRET', 'AGENT_SANDBOX_PROXY_URL'] as const)(
    'rejects missing %s before accessing a sandbox',
    async (field) => {
      mocks.env[field] = undefined;
      await expect(invoke({ appId, chatId: 'chat-1', channel: 'fs' })).rejects.toThrow(field);
      expect(mocks.authSandboxRuntimeSession).not.toHaveBeenCalled();
      expect(mocks.getSandboxClient).not.toHaveBeenCalled();
    }
  );

  it('rejects a malformed proxy URL before preparing a sandbox', async () => {
    mocks.env.AGENT_SANDBOX_PROXY_URL = 'wss://%invalid';
    await expect(invoke({ appId, chatId: 'chat-1', channel: 'fs' })).rejects.toThrow();
    expect(mocks.getSandboxClient).not.toHaveBeenCalled();
  });

  it('rejects malformed requests before authentication', async () => {
    await expect(invoke({ appId, chatId: 'chat-1', channel: 'unknown' })).rejects.toBeInstanceOf(
      ApiRequestInputParseError
    );
    expect(mocks.authSandboxRuntimeSession).not.toHaveBeenCalled();
  });

  it('does not prepare a sandbox when authentication fails', async () => {
    mocks.authSandboxRuntimeSession.mockRejectedValueOnce(new Error('Forbidden'));
    await expect(invoke({ appId, chatId: 'chat-1', channel: 'fs' })).rejects.toThrow('Forbidden');
    expect(mocks.getSandboxClient).not.toHaveBeenCalled();
  });

  it('does not issue a connection when the current Chat directory cannot be prepared', async () => {
    mocks.createDirectories.mockRejectedValueOnce(new Error('mkdir failed'));
    await expect(invoke({ appId, chatId: 'chat-1', channel: 'fs' })).rejects.toThrow(
      'mkdir failed'
    );
  });
});
