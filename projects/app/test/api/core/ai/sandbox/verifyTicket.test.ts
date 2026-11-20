import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ApiRequestInputParseError } from '@fastgpt/service/common/zod/requestParseError';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authAgentSandboxProxy: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  exec: vi.fn(),
  getEndpoint: vi.fn(),
  getSandboxClient: vi.fn(),
  readFiles: vi.fn(),
  resolveSandboxPreviewSession: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authAgentSandboxProxy: mocks.authAgentSandboxProxy
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/client', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/preview', () => ({
  resolveSandboxPreviewSession: mocks.resolveSandboxPreviewSession
}));

import { invalidateIdeAgentPasswordCache } from '@fastgpt/service/core/ai/sandbox/application/ideAgent';
import apiHandler from '@/pages/api/core/ai/sandbox/verifyTicket';

// NextAPI 在本文件中返回原始业务 handler，调用时无需 HTTP response 参数。
const handler = apiHandler as (
  req: Parameters<typeof apiHandler>[0]
) => ReturnType<typeof apiHandler>;

const secret = 'preview-secret-1234567890-1234567890';

const createTicket = (channel: 'fs' | 'terminal', permission = 'read') =>
  jwt.sign(
    {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1',
      chatId: 'chat-1',
      teamId: 'team-1',
      channel,
      permission
    },
    secret,
    { expiresIn: 60 }
  );

const createReq = (ticket: string) => ({ query: { ticket }, headers: {} }) as any;
const previewSandboxId = 'app-0123456789abcdef';
const previewSessionId = 'a12345678901234567890123';
const createPreviewReq = () =>
  ({ query: {}, headers: { 'x-sandbox-preview-session': previewSessionId } }) as any;
const previewContext = {
  sandboxId: previewSandboxId,
  sourceType: ChatSourceTypeEnum.app,
  sourceId: 'app-1',
  userId: 'user-1',
  chatId: 'chat-1'
};

describe('sandbox verifyTicket API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateIdeAgentPasswordCache();
    mocks.authAgentSandboxProxy.mockReturnValue(secret);
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({ sandboxId: 'sandbox-1' });
    mocks.resolveSandboxPreviewSession.mockResolvedValue(previewContext);
    mocks.getEndpoint.mockResolvedValue({ url: 'http://sandbox.internal' });
    mocks.readFiles.mockResolvedValue([
      {
        path: '/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password',
        content: Uint8Array.from(Buffer.from('ide-agent-secret\n')),
        error: null
      }
    ]);
    mocks.getSandboxClient.mockImplementation(async (query: { sandboxId: string }) => ({
      getSandboxId: () => query.sandboxId,
      exec: mocks.exec,
      runWithRecovery: vi.fn(async (fn: () => Promise<unknown>) => fn()),
      opensandbox: {
        id: `remote-${query.sandboxId}`,
        getEndpoint: mocks.getEndpoint,
        readFiles: mocks.readFiles
      }
    }));
  });

  it.each([previewSessionId, `${previewSandboxId}:${previewSessionId}`])(
    'resolves preview credential %s to the read-only HTTP listener',
    async (credential) => {
      const req = createPreviewReq();
      req.headers['x-sandbox-preview-session'] = credential;
      const res = await handler(req);
      expect(res).toMatchObject({
        sandbox_url: 'http://sandbox.internal',
        upstream_headers: {
          'x-fastgpt-agent-token': 'ide-agent-secret'
        }
      });
      expect('agent_token' in res).toBe(false);

      expect(mocks.exec).not.toHaveBeenCalled();
      expect(mocks.resolveSandboxPreviewSession).toHaveBeenCalledWith(credential);
      expect(mocks.getSandboxClient).toHaveBeenCalledWith(previewContext);
      expect(mocks.getEndpoint).toHaveBeenCalledWith(1319);
    }
  );

  it('keeps WebSocket tickets on the existing IDE Agent listener and forwards upstream_headers', async () => {
    mocks.getEndpoint.mockResolvedValueOnce({
      url: 'http://sandbox.internal/proxy/1318',
      headers: {
        'OPEN-SANDBOX-API-KEY': 'osb-key',
        'X-Sandbox-Token': 'ep-token'
      }
    });

    const res = await handler(createReq(createTicket('fs')));
    expect(res).toMatchObject({
      sandbox_url: 'http://sandbox.internal/proxy/1318',
      upstream_headers: {
        'OPEN-SANDBOX-API-KEY': 'osb-key',
        'X-Sandbox-Token': 'ep-token',
        'x-fastgpt-agent-token': 'ide-agent-secret'
      },
      ws_limits: { max_message_bytes: 64 * 1024 * 1024, max_frame_bytes: 16 * 1024 * 1024 }
    });
    expect('agent_token' in res).toBe(false);
    expect(mocks.exec).not.toHaveBeenCalled();
    expect(mocks.getEndpoint).toHaveBeenCalledWith(1318);
  });

  it('prefers the preview session header over the WebSocket ticket query', async () => {
    const req = createPreviewReq();
    req.query.ticket = 'invalid-legacy-ticket';

    await expect(handler(req)).resolves.toMatchObject({
      sandbox_url: 'http://sandbox.internal'
    });
    expect(mocks.getEndpoint).toHaveBeenCalledWith(1319);
  });

  it('rejects expired preview sessions', async () => {
    mocks.resolveSandboxPreviewSession.mockRejectedValueOnce(
      new Error('Invalid or expired sandbox preview session')
    );

    await expect(handler(createPreviewReq())).rejects.toThrow(
      'Invalid or expired sandbox preview session'
    );
    expect(mocks.getSandboxClient).not.toHaveBeenCalled();
  });

  it.each(['', '   '])(
    'rejects empty preview session header %j with ApiRequestInputParseError',
    async (badSession) => {
      await expect(
        handler({
          query: { ticket: createTicket('fs') },
          headers: { 'x-sandbox-preview-session': badSession }
        } as any)
      ).rejects.toBeInstanceOf(ApiRequestInputParseError);
      expect(mocks.resolveSandboxPreviewSession).not.toHaveBeenCalled();
      expect(mocks.getSandboxClient).not.toHaveBeenCalled();
    }
  );

  it('rejects requests without a WebSocket ticket or preview session', async () => {
    await expect(handler({ query: {}, headers: {} } as any)).rejects.toBeInstanceOf(
      ApiRequestInputParseError
    );
    expect(mocks.getSandboxClient).not.toHaveBeenCalled();
  });

  it('recovers and retries getEndpoint via real SandboxClient.runWithRecovery on recoverable error', async () => {
    const { SandboxClient } = await vi.importActual<
      typeof import('@fastgpt/service/core/ai/sandbox/application/runtime/client')
    >('@fastgpt/service/core/ai/sandbox/application/runtime/client');
    const query = {
      sandboxId: 'sandbox-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1',
      chatId: 'chat-1'
    };
    const brokenSandbox = {
      id: 'remote-sandbox-1',
      close: vi.fn(async () => undefined),
      getEndpoint: vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' })),
      readFiles: mocks.readFiles
    };
    const recoveredSandbox = {
      id: 'remote-sandbox-2',
      close: vi.fn(async () => undefined),
      getEndpoint: vi.fn().mockResolvedValue({ url: 'http://recovered-sandbox.internal' }),
      readFiles: mocks.readFiles
    };
    const initialRuntime = {
      resource: { ...query, provider: 'opensandbox', status: 'running', teamId: 'team-1' },
      opensandbox: brokenSandbox
    } as any;
    const recoveredRuntime = {
      resource: { ...query, provider: 'opensandbox', status: 'running', teamId: 'team-1' },
      opensandbox: recoveredSandbox
    } as any;
    let currentRuntime = initialRuntime;
    const prepare = vi.fn(async (_conn: unknown, options?: { verifyHealth?: boolean }) => {
      if (options?.verifyHealth) {
        currentRuntime = recoveredRuntime;
      }
      return currentRuntime;
    });
    const realClient = new SandboxClient({
      query,
      runtime: initialRuntime,
      prepare
    });
    mocks.getSandboxClient.mockResolvedValueOnce(realClient);

    await expect(handler(createReq(createTicket('fs')))).resolves.toMatchObject({
      sandbox_url: 'http://recovered-sandbox.internal',
      upstream_headers: {
        'x-fastgpt-agent-token': 'ide-agent-secret'
      }
    });

    expect(prepare).toHaveBeenCalledWith(expect.anything(), { verifyHealth: true });
    expect(brokenSandbox.close).toHaveBeenCalled();
    expect(recoveredSandbox.getEndpoint).toHaveBeenCalledWith(1318);
  });

  it('bypasses the in-memory ideAgent password cache when forceRefresh=true', async () => {
    await expect(handler(createReq(createTicket('fs')))).resolves.toMatchObject({
      upstream_headers: {
        'x-fastgpt-agent-token': 'ide-agent-secret'
      }
    });
    expect(mocks.readFiles).toHaveBeenCalledTimes(1);

    mocks.readFiles.mockResolvedValueOnce([
      {
        path: '/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password',
        content: Uint8Array.from(Buffer.from('rotated-agent-secret\n')),
        error: null
      }
    ]);

    // 未带 forceRefresh 时继续命中 30s 进程内缓存。
    await expect(handler(createReq(createTicket('fs')))).resolves.toMatchObject({
      upstream_headers: {
        'x-fastgpt-agent-token': 'ide-agent-secret'
      }
    });
    expect(mocks.readFiles).toHaveBeenCalledTimes(1);

    // 携带 forceRefresh=true 后主动失效缓存并读取最新密码。
    await expect(
      handler({
        query: { ticket: createTicket('fs'), forceRefresh: 'true' },
        headers: {}
      } as any)
    ).resolves.toMatchObject({
      upstream_headers: {
        'x-fastgpt-agent-token': 'rotated-agent-secret'
      }
    });
    expect(mocks.readFiles).toHaveBeenCalledTimes(2);
  });

  it('immediately rethrows recoverable readFiles errors from ideAgent without polling 50 times', async () => {
    mocks.readFiles.mockResolvedValueOnce([
      {
        path: '/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password',
        content: new Uint8Array(),
        error: Object.assign(new Error('ECONNRESET'), { code: 'ECONNRESET' })
      }
    ]);

    await expect(handler(createReq(createTicket('fs')))).rejects.toThrow(
      'Failed to read IDE Agent password'
    );
    expect(mocks.readFiles).toHaveBeenCalledTimes(1);
  });
});
