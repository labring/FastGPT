import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authAgentSandboxProxy: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  exec: vi.fn(),
  getEndpoint: vi.fn(),
  getSandboxClient: vi.fn(),
  resolveSandboxPreviewSession: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authAgentSandboxProxy: mocks.authAgentSandboxProxy
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource,
  getSandboxClient: mocks.getSandboxClient
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/preview', () => ({
  resolveSandboxPreviewSession: mocks.resolveSandboxPreviewSession
}));

import handler from '@/pages/api/core/ai/sandbox/verifyTicket';

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
const previewCredential = `${previewSandboxId}:${previewSessionId}`;
const createPreviewReq = () =>
  ({ query: {}, headers: { 'x-sandbox-preview-session': previewCredential } }) as any;
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
    mocks.authAgentSandboxProxy.mockReturnValue(secret);
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({ sandboxId: 'sandbox-1' });
    mocks.resolveSandboxPreviewSession.mockResolvedValue(previewContext);
    mocks.exec.mockResolvedValue({ stdout: 'agent-password\n', stderr: '', exitCode: 0 });
    mocks.getEndpoint.mockResolvedValue({ url: 'http://sandbox.internal' });
    mocks.getSandboxClient.mockResolvedValue({
      exec: mocks.exec,
      provider: { getEndpoint: mocks.getEndpoint }
    });
  });

  it('resolves preview sessions to the read-only HTTP listener', async () => {
    await expect(handler(createPreviewReq())).resolves.toMatchObject({
      sandbox_url: 'http://sandbox.internal',
      agent_token: 'agent-password'
    });

    expect(mocks.resolveSandboxPreviewSession).toHaveBeenCalledWith(previewCredential);
    expect(mocks.getSandboxClient).toHaveBeenCalledWith(previewContext);
    expect(mocks.getEndpoint).toHaveBeenCalledWith(1319);
  });

  it('keeps WebSocket tickets on the existing IDE Agent listener', async () => {
    await handler(createReq(createTicket('fs')));
    expect(mocks.getEndpoint).toHaveBeenCalledWith(1318);
  });

  it('prefers the preview session header over the legacy query transport', async () => {
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

  it('rejects requests without a ticket in either transport', async () => {
    await expect(handler({ query: {}, headers: {} } as any)).rejects.toThrow();
    expect(mocks.getSandboxClient).not.toHaveBeenCalled();
  });
});
