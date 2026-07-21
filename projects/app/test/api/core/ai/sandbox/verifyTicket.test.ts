import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import jwt from 'jsonwebtoken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authAgentSandboxProxy: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  exec: vi.fn(),
  getEndpoint: vi.fn(),
  getSandboxClient: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authAgentSandboxProxy: mocks.authAgentSandboxProxy,
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

import handler from '@/pages/api/core/ai/sandbox/verifyTicket';

const secret = 'preview-secret-1234567890-1234567890';

const createTicket = (channel: 'fs' | 'terminal' | 'preview', permission = 'read') =>
  jwt.sign(
    {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app-1',
      userId: 'user-1',
      chatId: 'chat-1',
      ...(channel === 'preview' ? {} : { teamId: 'team-1' }),
      channel,
      permission
    },
    secret,
    { expiresIn: 60 }
  );

const createReq = (ticket: string) => ({ query: { ticket }, headers: {} }) as any;
const createHeaderReq = (ticket: string) =>
  ({ query: {}, headers: { 'x-sandbox-ticket': ticket } }) as any;

describe('sandbox verifyTicket API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authAgentSandboxProxy.mockReturnValue(secret);
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({ sandboxId: 'sandbox-1' });
    mocks.exec.mockResolvedValue({ stdout: 'agent-password\n', stderr: '', exitCode: 0 });
    mocks.getEndpoint.mockResolvedValue({ url: 'http://sandbox.internal' });
    mocks.getSandboxClient.mockResolvedValue({
      exec: mocks.exec,
      provider: { getEndpoint: mocks.getEndpoint }
    });
  });

  it('resolves preview tickets to the read-only HTTP listener', async () => {
    await expect(handler(createHeaderReq(createTicket('preview')))).resolves.toMatchObject({
      sandbox_url: 'http://sandbox.internal',
      agent_token: 'agent-password'
    });

    expect(mocks.getEndpoint).toHaveBeenCalledWith(1319);
  });

  it('keeps WebSocket tickets on the existing IDE Agent listener', async () => {
    await handler(createReq(createTicket('fs')));
    expect(mocks.getEndpoint).toHaveBeenCalledWith(1318);
  });

  it('prefers the internal header over the legacy query transport', async () => {
    const req = createHeaderReq(createTicket('preview'));
    req.query.ticket = 'invalid-legacy-ticket';

    await expect(handler(req)).resolves.toMatchObject({
      sandbox_url: 'http://sandbox.internal'
    });
    expect(mocks.getEndpoint).toHaveBeenCalledWith(1319);
  });

  it('rejects write permission on preview tickets', async () => {
    await expect(handler(createHeaderReq(createTicket('preview', 'write')))).rejects.toThrow(
      'Invalid ticket signature'
    );
    expect(mocks.getSandboxClient).not.toHaveBeenCalled();
  });

  it('rejects requests without a ticket in either transport', async () => {
    await expect(handler({ query: {}, headers: {} } as any)).rejects.toThrow();
    expect(mocks.getSandboxClient).not.toHaveBeenCalled();
  });
});
