import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authAgentSandboxProxy: vi.fn(),
  getSandboxClient: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: vi.fn((handler) => handler)
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authAgentSandboxProxy: mocks.authAgentSandboxProxy
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', () => ({
  getSandboxClient: mocks.getSandboxClient
}));

import handler from '@/pages/api/core/ai/sandbox/keepalive';

const createReq = () =>
  ({
    body: {
      appId: 'app-1',
      userId: 'user-1',
      chatId: 'chat-1',
      teamId: 'team-1'
    }
  }) as any;

const createRes = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn()
  };
  res.status.mockReturnValue(res);
  return res as any;
};

describe('sandbox keepalive API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSandboxClient.mockResolvedValue(undefined);
  });

  it('refreshes runtime sandbox without triggering archived restore', async () => {
    const req = createReq();

    await handler(req, createRes());

    expect(mocks.authAgentSandboxProxy).toHaveBeenCalledWith(req);
    expect(mocks.getSandboxClient).toHaveBeenCalledWith(
      {
        appId: 'app-1',
        userId: 'user-1',
        chatId: 'chat-1',
        teamId: 'team-1'
      },
      {
        restoreArchived: false
      }
    );
  });
});
