import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authSandboxSession } from '@/service/core/sandbox/auth';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';

vi.mock('@fastgpt/service/core/chat/auth', () => ({
  authChatTargetCrud: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authApp: vi.fn()
}));

describe('authSandboxSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the already checked proxy write permission without re-authenticating the key creator', async () => {
    vi.mocked(authChatTargetCrud).mockResolvedValue({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app',
      teamId: 'team',
      tmbId: 'member-B',
      uid: 'member-B',
      isProxy: true
    } as any);
    await expect(
      authSandboxSession({
        req: {} as any,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app',
        chatId: 'chat',
        authProxy: { tmbId: 'member-B' },
        per: WritePermissionVal
      })
    ).resolves.toMatchObject({ uid: 'member-B' });
    expect(authApp).not.toHaveBeenCalled();
    expect(authChatTargetCrud).toHaveBeenCalledWith(
      expect.objectContaining({ per: WritePermissionVal, authProxy: { tmbId: 'member-B' } })
    );
  });

  it('returns the source resolved by authChatTargetCrud for share chat sessions', async () => {
    vi.mocked(authChatTargetCrud).mockResolvedValue({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'resolved-app-id',
      teamId: 'team-id',
      tmbId: 'tmb-id',
      uid: 'share-user-id',
      showCite: true,
      showRunningStatus: true,
      showSkillReferences: false,
      showFullText: false,
      canDownloadSource: false
    });

    await expect(
      authSandboxSession({
        req: {} as any,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: undefined,
        chatId: 'chat-1',
        outLinkAuthData: {
          shareId: 'share-1',
          outLinkUid: 'outlink-user-1'
        }
      })
    ).resolves.toMatchObject({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'resolved-app-id',
      uid: 'share-user-id',
      teamId: 'team-id'
    });

    expect(authChatTargetCrud).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: undefined,
        outLinkAuthData: {
          shareId: 'share-1',
          outLinkUid: 'outlink-user-1'
        },
        chatId: 'chat-1'
      })
    );
  });

  it('rejects skillEdit API sandbox sessions with non-edit-debug chatId', async () => {
    await expect(
      authSandboxSession({
        req: {} as any,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: 'skill-1',
        chatId: 'debug-session-123'
      })
    ).rejects.toThrow('Skill edit sandbox only supports edit-debug chat');

    expect(authChatTargetCrud).not.toHaveBeenCalled();
  });
});
