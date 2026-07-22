import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authSandboxSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  getAppSandboxRuntimeStatus: vi.fn(),
  upgradeAppSandboxRuntime: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authSandboxSession: mocks.authSandboxSession,
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  getAppSandboxRuntimeStatus: mocks.getAppSandboxRuntimeStatus,
  upgradeAppSandboxRuntime: mocks.upgradeAppSandboxRuntime
}));

import getStatusHandler from '@/pages/api/core/ai/sandbox/runtime/getStatus';
import upgradeHandler from '@/pages/api/core/ai/sandbox/runtime/upgrade';

const appId = '64f000000000000000000001';
const query = {
  sandboxId: 'sandbox-1',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: appId,
  userId: 'authenticated-user',
  chatId: 'chat-1'
};
const createReq = () =>
  ({
    body: {
      appId,
      chatId: query.chatId
    }
  }) as any;

describe('sandbox runtime upgrade APIs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSandboxSession.mockResolvedValue({
      uid: query.userId,
      teamId: 'team-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId
    });
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue(query);
  });

  it('returns the current image status without starting an upgrade', async () => {
    mocks.getAppSandboxRuntimeStatus.mockResolvedValue({
      status: 'upgradeRequired'
    });

    const result = await getStatusHandler(createReq());

    expect(mocks.authSandboxSession).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: appId,
        chatId: query.chatId
      })
    );
    expect(mocks.buildSandboxClientQueryFromChatSource).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: query.userId,
      chatId: query.chatId
    });
    expect(mocks.getAppSandboxRuntimeStatus).toHaveBeenCalledWith(query);
    expect(mocks.upgradeAppSandboxRuntime).not.toHaveBeenCalled();
    expect(result).toEqual({ status: 'upgradeRequired' });
  });

  it('starts the upgrade for the authenticated App sandbox', async () => {
    mocks.upgradeAppSandboxRuntime.mockResolvedValue({
      status: 'upgrading'
    });

    const result = await upgradeHandler(createReq());

    expect(mocks.upgradeAppSandboxRuntime).toHaveBeenCalledWith(query);
    expect(result.status).toBe('upgrading');
  });
});
