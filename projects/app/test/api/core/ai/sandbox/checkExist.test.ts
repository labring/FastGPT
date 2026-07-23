import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { SandboxUnavailableReasonEnum } from '@fastgpt/global/core/ai/sandbox/constants';

const mocks = vi.hoisted(() => ({
  authSandboxSession: vi.fn(),
  buildSandboxClientQueryFromChatSource: vi.fn(),
  checkSandboxSessionExist: vi.fn(),
  resolveSandboxSessionAvailability: vi.fn()
}));

vi.mock('@/service/middleware/entry', () => ({
  NextAPI: (handler: unknown) => handler
}));

vi.mock('@/service/core/sandbox/auth', () => ({
  authSandboxSession: mocks.authSandboxSession
}));

vi.mock('@/service/core/sandbox/access', () => ({
  resolveSandboxSessionAvailability: mocks.resolveSandboxSessionAvailability
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/session', () => ({
  checkSandboxSessionExist: mocks.checkSandboxSessionExist
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', () => ({
  buildSandboxClientQueryFromChatSource: mocks.buildSandboxClientQueryFromChatSource
}));

import handler from '@/pages/api/core/ai/sandbox/checkExist';

describe('sandbox checkExist API', () => {
  const appId = '64f000000000000000000001';
  const skillId = '64f000000000000000000002';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authSandboxSession.mockResolvedValue({
      uid: 'user-1',
      teamId: 'team-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId
    });
    mocks.buildSandboxClientQueryFromChatSource.mockReturnValue({
      sandboxId: 'sandbox-1',
      sourceType: ChatSourceTypeEnum.app,
      sourceId: appId,
      userId: 'user-1',
      chatId: 'chat-1'
    });
    mocks.checkSandboxSessionExist.mockResolvedValue(true);
    mocks.resolveSandboxSessionAvailability.mockResolvedValue({ available: true });
  });

  it.each(Object.values(SandboxUnavailableReasonEnum))(
    'keeps existing instance visibility when Sandbox is unavailable because of %s',
    async (reason) => {
      mocks.resolveSandboxSessionAvailability.mockResolvedValueOnce({
        available: false,
        reason
      });

      await expect(handler({ body: { appId, chatId: 'chat-1' } } as any)).resolves.toEqual({
        exists: true,
        unavailableReason: reason
      });
      expect(mocks.checkSandboxSessionExist).toHaveBeenCalledOnce();
    }
  );

  it('returns the actual instance state when sandbox is available', async () => {
    mocks.checkSandboxSessionExist.mockResolvedValueOnce(false);

    await expect(handler({ body: { appId, chatId: 'chat-1' } } as any)).resolves.toEqual({
      exists: false
    });
    expect(mocks.checkSandboxSessionExist).toHaveBeenCalledOnce();
  });

  it('uses the same availability resolver for Skill Edit strong authorization', async () => {
    mocks.authSandboxSession.mockResolvedValueOnce({
      uid: 'user-1',
      teamId: 'team-1',
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: skillId
    });
    mocks.checkSandboxSessionExist.mockResolvedValueOnce(true);

    await expect(handler({ body: { skillId, chatId: 'edit-debug' } } as any)).resolves.toEqual({
      exists: true
    });
    expect(mocks.authSandboxSession).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: ChatSourceTypeEnum.skillEdit })
    );
    expect(mocks.resolveSandboxSessionAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: ChatSourceTypeEnum.skillEdit })
    );
  });
});
