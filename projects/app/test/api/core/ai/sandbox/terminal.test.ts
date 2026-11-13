import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { serviceEnv } from '@fastgpt/service/env';

const mocks = vi.hoisted(() => ({
  authSandboxRuntimeSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  getSandboxClient: vi.fn(),
  ensureSandboxPtySession: vi.fn(),
  resolveVerifiedSandboxPtySession: vi.fn(),
  resolveSandboxPreviewSession: vi.fn(),
  keepaliveSandboxSessionsByIds: vi.fn(),
  close: vi.fn(),
  getEndpoint: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/access', () => ({
  authSandboxRuntimeSession: mocks.authSandboxRuntimeSession
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime', () => ({
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/pty', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/application/pty')>()),
  ensureSandboxPtySession: mocks.ensureSandboxPtySession,
  resolveVerifiedSandboxPtySession: mocks.resolveVerifiedSandboxPtySession
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/preview', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@fastgpt/service/core/ai/sandbox/application/preview')
  >()),
  resolveSandboxPreviewSession: mocks.resolveSandboxPreviewSession
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/session', () => ({
  keepaliveSandboxSessionsByIds: mocks.keepaliveSandboxSessionsByIds
}));

import getTicketHandler from '@/pages/api/core/ai/sandbox/getTicket';
import verifyTicketHandler from '@/pages/api/core/ai/sandbox/verifyTicket';
import keepaliveHandler from '@/pages/api/core/ai/sandbox/keepalive';
import { AGENT_SANDBOX_PROXY_SECRET_HEADER } from '@fastgpt/global/core/ai/sandbox/constants';

const skillId = '507f1f77bcf86cd799439012';
const PROXY_SECRET = 'test-opensandbox-proxy-secret';
const originalEnv = {
  AGENT_SANDBOX_PROXY_URL: serviceEnv.AGENT_SANDBOX_PROXY_URL,
  AGENT_SANDBOX_PROXY_SECRET: serviceEnv.AGENT_SANDBOX_PROXY_SECRET
};

describe('sandbox opensandbox-proxy internal & ticket APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(serviceEnv, {
      AGENT_SANDBOX_PROXY_URL: 'https://sandbox.example.com',
      AGENT_SANDBOX_PROXY_SECRET: PROXY_SECRET
    });
    mocks.close.mockResolvedValue(undefined);
    mocks.getEndpoint.mockResolvedValue({
      url: 'http://opensandbox-server:8090/v1/sandboxes/sbx-1/proxy/44772/',
      headers: { 'OPEN-SANDBOX-API-KEY': 'os-secret' }
    });
    mocks.authSandboxRuntimeSession.mockResolvedValue({
      uid: 'user-1',
      teamId: 'team-1',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId
    });
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({
      sandboxId: 'skilledit-1234567890abcdef',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: 'user-1',
      chatId: 'edit-debug'
    });
    mocks.getSandboxClient.mockResolvedValue({
      close: mocks.close,
      recover: vi.fn(),
      retryOnRecoverableError: vi.fn(async (fn: () => Promise<unknown>) => fn()),
      opensandbox: {
        getEndpoint: mocks.getEndpoint
      },
      getRuntimePaths: () => ({
        workspaceRoot: '/workspace',
        runtimeSkillsRoot: '/workspace/projects',
        sessionWorkDirectory: '/workspace'
      })
    });
    const ptyResult = {
      ptySessionId: 'pty-1',
      httpBaseUrl: 'http://opensandbox-server:8090/v1/sandboxes/sbx-1/proxy/44772',
      headers: { 'OPEN-SANDBOX-API-KEY': 'os-secret' },
      reused: true
    };
    mocks.ensureSandboxPtySession.mockResolvedValue(ptyResult);
    mocks.resolveVerifiedSandboxPtySession.mockResolvedValue(ptyResult);
    mocks.keepaliveSandboxSessionsByIds.mockResolvedValue(2);
  });

  afterEach(() => {
    Object.assign(serviceEnv, originalEnv);
  });

  it('issues a 60s HS256 JWT ticket and normalized WS /terminal URL for skillEdit sessions', async () => {
    const res = await getTicketHandler({
      body: {
        skillId,
        chatId: 'edit-debug',
        cols: 120,
        rows: 36
      }
    } as any);

    expect(mocks.authSandboxRuntimeSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: skillId,
        chatId: 'edit-debug',
        per: WritePermissionVal
      })
    );
    expect(mocks.ensureSandboxPtySession).toHaveBeenCalledWith(expect.anything(), {
      cols: 120,
      rows: 36
    });
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(res).toMatchObject({
      url: 'wss://sandbox.example.com/terminal',
      ptySessionId: 'pty-1',
      reused: true
    });

    const decoded = jwt.verify(res.ticket, PROXY_SECRET, { algorithms: ['HS256'] }) as Record<
      string,
      unknown
    >;
    expect(decoded).toMatchObject({
      sandboxId: 'skilledit-1234567890abcdef',
      ptySessionId: 'pty-1',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId,
      userId: 'user-1',
      chatId: 'edit-debug',
      cols: 120,
      rows: 36
    });
  });

  it('rejects non-skillEdit sessions in getTicket before authentication', async () => {
    await expect(
      getTicketHandler({
        body: {
          appId: '507f1f77bcf86cd799439011',
          chatId: 'chat-1'
        }
      } as any)
    ).rejects.toThrow('Sandbox terminal is only available in edit debug sessions');
    expect(mocks.authSandboxRuntimeSession).not.toHaveBeenCalled();
  });

  it('verifies terminal ticket and previewSessionId via x-agent-sandbox-proxy-secret', async () => {
    // Missing or wrong proxy secret must fail with unAuthorization
    await expect(
      verifyTicketHandler({
        headers: {},
        query: { previewSessionId: 'a12345678901234567890123' }
      } as any)
    ).rejects.toThrow(ERROR_ENUM.unAuthorization);

    await expect(
      verifyTicketHandler({
        headers: { [AGENT_SANDBOX_PROXY_SECRET_HEADER]: 'wrong-secret' },
        query: { previewSessionId: 'a12345678901234567890123' }
      } as any)
    ).rejects.toThrow(ERROR_ENUM.unAuthorization);

    // 1. Terminal ticket mode
    const issued = await getTicketHandler({
      body: { skillId, chatId: 'edit-debug', cols: 100, rows: 30 }
    } as any);

    const terminalVerified = await verifyTicketHandler({
      headers: { [AGENT_SANDBOX_PROXY_SECRET_HEADER]: PROXY_SECRET },
      query: { ticket: issued.ticket }
    } as any);
    expect(mocks.resolveVerifiedSandboxPtySession).toHaveBeenCalledWith({
      sandbox: expect.anything(),
      expectedPtySessionId: 'pty-1',
      cols: 100,
      rows: 30
    });
    expect(terminalVerified).toEqual({
      sandboxId: 'skilledit-1234567890abcdef',
      execdBaseUrl: 'http://opensandbox-server:8090/v1/sandboxes/sbx-1/proxy/44772',
      execdHeaders: { 'OPEN-SANDBOX-API-KEY': 'os-secret' },
      ptySessionId: 'pty-1',
      reused: true
    });

    // 2. Preview session mode
    mocks.resolveSandboxPreviewSession.mockResolvedValueOnce({
      sandboxId: 'app-1234567890abcdef',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011',
      userId: 'user-1',
      chatId: 'chat-1'
    });
    const previewVerified = await verifyTicketHandler({
      headers: { [AGENT_SANDBOX_PROXY_SECRET_HEADER]: PROXY_SECRET },
      query: { previewSessionId: 'a12345678901234567890123' }
    } as any);
    expect(previewVerified).toEqual({
      sandboxId: 'app-1234567890abcdef',
      execdBaseUrl: 'http://opensandbox-server:8090/v1/sandboxes/sbx-1/proxy/44772',
      execdHeaders: { 'OPEN-SANDBOX-API-KEY': 'os-secret' },
      rootDirectory: '/workspace'
    });

    // 3. Preview session mode runs through retryOnRecoverableError
    mocks.resolveSandboxPreviewSession.mockResolvedValueOnce({
      sandboxId: 'app-1234567890abcdef',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '507f1f77bcf86cd799439011',
      userId: 'user-1',
      chatId: 'chat-1'
    });
    const retryCallsBefore = (await mocks.getSandboxClient.mock.results[0].value)
      .retryOnRecoverableError.mock.calls.length;
    await verifyTicketHandler({
      headers: { [AGENT_SANDBOX_PROXY_SECRET_HEADER]: PROXY_SECRET },
      query: { previewSessionId: 'a12345678901234567890123' }
    } as any);
    expect(
      (await mocks.getSandboxClient.mock.results[0].value).retryOnRecoverableError.mock.calls.length
    ).toBe(retryCallsBefore + 1);
  });

  it('authenticates keepalive batch requests and deduplicates sandboxIds via schema', async () => {
    await expect(
      keepaliveHandler({
        headers: { [AGENT_SANDBOX_PROXY_SECRET_HEADER]: 'bad' },
        body: { sandboxIds: ['sbx-1'] }
      } as any)
    ).rejects.toThrow(ERROR_ENUM.unAuthorization);

    await keepaliveHandler({
      headers: { [AGENT_SANDBOX_PROXY_SECRET_HEADER]: PROXY_SECRET },
      body: { sandboxIds: ['sbx-1', 'sbx-2', 'sbx-1'] }
    } as any);
    expect(mocks.keepaliveSandboxSessionsByIds).toHaveBeenCalledWith(['sbx-1', 'sbx-2']);
  });
});
