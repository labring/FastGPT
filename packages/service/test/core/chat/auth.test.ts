import { MarkChatReadBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { authChatTargetCrud, assertChatAccess } from '@fastgpt/service/core/chat/auth';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { authOutLink } from '@fastgpt/service/support/permission/publish/authChat';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { ShareOutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/app/auth');
vi.mock('@fastgpt/service/support/permission/skill/auth');
vi.mock('@fastgpt/service/support/permission/publish/authChat');

const buildOutLinkConfig = (
  overrides: Partial<ShareOutLinkSchemaType> = {},
  omitKeys: (keyof ShareOutLinkSchemaType)[] = []
): ShareOutLinkSchemaType => {
  const config: ShareOutLinkSchemaType = {
    _id: 'outLink1',
    shareId: 'share1',
    teamId: 'team1',
    tmbId: 'tmb1',
    appId: 'app1',
    name: 'out-link',
    usagePoints: 0,
    lastTime: new Date(),
    type: PublishChannelEnum.share,
    showCite: true,
    showRunningStatus: true,
    showSkillReferences: false,
    showFullText: false,
    canDownloadSource: false,
    showWholeResponse: false,
    allowAnonymous: true,
    app: undefined,
    ...overrides
  };

  omitKeys.forEach((key) => {
    delete (config as Partial<ShareOutLinkSchemaType>)[key];
  });

  return config;
};

describe('authChatTargetCrud App and share access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it.each(['', undefined, null])('rejects an invalid appId: %s', async (sourceId) => {
      await expect(
        authChatTargetCrud({
          sourceId: sourceId as string,
          req: {} as any,
          authToken: true,
          sourceType: ChatSourceTypeEnum.app
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
      expect(authApp).not.toHaveBeenCalled();
    });
  });

  describe('outLink authentication', () => {
    it('should auth outLink without chatId', async () => {
      vi.mocked(authOutLink).mockResolvedValue({
        outLinkConfig: buildOutLinkConfig({
          canDownloadSource: true
        }),
        uid: 'user1',
        appId: 'app1'
      });

      const result = await authChatTargetCrud({
        req: {} as any,
        authToken: true,
        sourceType: ChatSourceTypeEnum.app,
        outLinkAuthData: { shareId: 'share1', outLinkUid: 'user1' }
      });

      expect(result).toMatchObject({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: 'app1',
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'user1',
        showCite: true,
        showRunningStatus: true,
        showFullText: false,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.outLink
      });
    });

    it('should auth outLink with default showRunningStatus and canDownloadSource', async () => {
      vi.mocked(authOutLink).mockResolvedValue({
        outLinkConfig: buildOutLinkConfig(
          {
            showCite: false
          },
          ['showRunningStatus', 'canDownloadSource']
        ),
        uid: 'user1',
        appId: 'app1'
      });

      const result = await authChatTargetCrud({
        sourceId: 'app1',
        req: {} as any,
        authToken: true,
        sourceType: ChatSourceTypeEnum.app,
        outLinkAuthData: { shareId: 'share1', outLinkUid: 'user1' }
      });

      expect(result).toMatchObject({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'user1',
        showCite: false,
        showRunningStatus: true, // default
        canDownloadSource: false, // default
        authType: AuthUserTypeEnum.outLink
      });
    });

    it('should auth outLink with chatId', async () => {
      const mockChat = {
        appId: 'app1',
        outLinkUid: 'user1'
      };

      vi.mocked(authOutLink).mockResolvedValue({
        outLinkConfig: buildOutLinkConfig({
          canDownloadSource: true
        }),
        uid: 'user1',
        appId: 'app1'
      });

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      const result = await authChatTargetCrud({
        sourceId: 'app1',
        chatId: 'chat1',
        req: {} as any,
        authToken: true,
        sourceType: ChatSourceTypeEnum.app,
        outLinkAuthData: { shareId: 'share1', outLinkUid: 'user1' }
      });

      expect(result).toMatchObject({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'user1',
        chat: mockChat,
        showCite: true,
        showRunningStatus: true,
        showFullText: false,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.outLink
      });
    });

    it('should handle missing chat for outLink auth', async () => {
      vi.mocked(authOutLink).mockResolvedValue({
        outLinkConfig: buildOutLinkConfig({
          showRunningStatus: false,
          canDownloadSource: true
        }),
        uid: 'user1',
        appId: 'app1'
      });

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(null)
      } as any);

      const result = await authChatTargetCrud({
        sourceId: 'app1',
        chatId: 'chat1',
        req: {} as any,
        authToken: true,
        sourceType: ChatSourceTypeEnum.app,
        outLinkAuthData: { shareId: 'share1', outLinkUid: 'user1' }
      });

      expect(result).toMatchObject({
        sourceId: 'app1',
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'user1',
        showCite: true,
        showRunningStatus: false,
        showSkillReferences: false,
        showFullText: false,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.outLink,
        isRoot: false
      });
    });

    it('should reject if chat outLinkUid does not match for outLink auth', async () => {
      const mockChat = {
        appId: 'app1',
        outLinkUid: 'different-user'
      };

      vi.mocked(authOutLink).mockResolvedValue({
        outLinkConfig: buildOutLinkConfig({
          showFullText: true,
          canDownloadSource: true
        }),
        uid: 'user1',
        appId: 'app1'
      });

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      await expect(
        authChatTargetCrud({
          sourceId: 'app1',
          chatId: 'chat1',
          req: {} as any,
          authToken: true,
          sourceType: ChatSourceTypeEnum.app,
          outLinkAuthData: { shareId: 'share1', outLinkUid: 'user1' }
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });

    it('should reject if outLink appId does not match', async () => {
      vi.mocked(authOutLink).mockResolvedValue({
        outLinkConfig: buildOutLinkConfig(),
        uid: 'user1',
        appId: 'different-app'
      });

      await expect(
        authChatTargetCrud({
          sourceId: 'app1',
          req: {} as any,
          authToken: true,
          sourceType: ChatSourceTypeEnum.app,
          outLinkAuthData: { shareId: 'share1', outLinkUid: 'user1' }
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });

    it.each([{ shareId: 'share1' }, { outLinkUid: 'user1' }])(
      'uses App authentication for incomplete share credentials: %j',
      async (outLinkAuthData) => {
        vi.mocked(authApp).mockRejectedValueOnce(new Error('Auth failed'));

        await expect(
          authChatTargetCrud({
            sourceId: 'app1',
            req: {} as any,
            authToken: true,
            sourceType: ChatSourceTypeEnum.app,
            outLinkAuthData: outLinkAuthData as any
          })
        ).rejects.toThrow('Auth failed');
        expect(authOutLink).not.toHaveBeenCalled();
      }
    );
  });

  describe('cookie authentication', () => {
    beforeEach(() => {
      vi.mocked(authApp).mockResolvedValue({
        teamId: 'team1',
        tmbId: 'tmb1',
        permission: new AppPermission({
          isOwner: true
        }),
        authType: AuthUserTypeEnum.token
      } as any);
    });

    it('should auth with cookie without chatId', async () => {
      const result = await authChatTargetCrud({
        sourceId: 'app1',
        req: {} as any,
        authToken: true,
        sourceType: ChatSourceTypeEnum.app
      });

      expect(result).toMatchObject({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'tmb1',
        showCite: true,
        showRunningStatus: true,
        showSkillReferences: true,
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.token
      });
    });

    it('keeps ordinary App API Key support without requiring callers to opt in again', async () => {
      vi.mocked(authApp).mockResolvedValue({
        teamId: 'team1',
        tmbId: 'tmb1',
        permission: new AppPermission({
          isOwner: true
        }),
        authType: AuthUserTypeEnum.apikey
      } as any);

      await authChatTargetCrud({
        sourceId: 'app1',
        req: {} as any,
        authToken: true,
        sourceType: ChatSourceTypeEnum.app
      });

      expect(vi.mocked(authApp)).toHaveBeenCalledWith(
        expect.objectContaining({
          authToken: true,
          authApiKey: true,
          appId: 'app1'
        })
      );
    });

    it('should auth with cookie and valid chatId for same team', async () => {
      const mockChat = {
        appId: 'app1',
        teamId: 'team1',
        tmbId: 'tmb1'
      };

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      const result = await authChatTargetCrud({
        sourceId: 'app1',
        chatId: 'chat1',
        req: {} as any,
        authToken: true,
        sourceType: ChatSourceTypeEnum.app
      });

      expect(result).toMatchObject({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'tmb1',
        chat: mockChat,
        showCite: true,
        showRunningStatus: true,
        showSkillReferences: true,
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.token
      });
    });

    it('should auth with readChatLogPer permission for different user chat', async () => {
      const mockChat = {
        appId: 'app1',
        teamId: 'team1',
        tmbId: 'different-tmb'
      };

      vi.mocked(authApp).mockResolvedValue({
        teamId: 'team1',
        tmbId: 'tmb1',
        permission: new AppPermission({
          isOwner: false,
          role: 8 // ReadChatLogRole value 0b1000
        }),
        authType: AuthUserTypeEnum.token
      } as any);

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      const result = await authChatTargetCrud({
        sourceId: 'app1',
        chatId: 'chat1',
        req: {} as any,
        authToken: true,
        sourceType: ChatSourceTypeEnum.app
      });

      expect(result).toMatchObject({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'different-tmb',
        chat: mockChat,
        showCite: true,
        showRunningStatus: true,
        showSkillReferences: true,
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.token
      });
    });

    it('should handle missing chat for cookie auth', async () => {
      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(null)
      } as any);

      const result = await authChatTargetCrud({
        sourceId: 'app1',
        chatId: 'chat1',
        req: {} as any,
        authToken: true,
        sourceType: ChatSourceTypeEnum.app
      });

      expect(result).toMatchObject({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'tmb1',
        showCite: true,
        showRunningStatus: true,
        showSkillReferences: true,
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.token
      });
    });

    it('should reject if chat belongs to different team', async () => {
      const mockChat = {
        appId: 'app1',
        teamId: 'different-team',
        tmbId: 'tmb1'
      };

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      await expect(
        authChatTargetCrud({
          sourceId: 'app1',
          chatId: 'chat1',
          req: {} as any,
          authToken: true,
          sourceType: ChatSourceTypeEnum.app
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });

    it('should reject if user has no permission for different user chat', async () => {
      const mockChat = {
        appId: 'app1',
        teamId: 'team1',
        tmbId: 'different-tmb'
      };

      vi.mocked(authApp).mockResolvedValue({
        teamId: 'team1',
        tmbId: 'tmb1',
        permission: new AppPermission({
          isOwner: false,
          role: 0 // no role/permissions
        }),
        authType: AuthUserTypeEnum.token
      } as any);

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      await expect(
        authChatTargetCrud({
          sourceId: 'app1',
          chatId: 'chat1',
          req: {} as any,
          authToken: true,
          sourceType: ChatSourceTypeEnum.app
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });
  });
});

describe('authChatTargetCrud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('selects the external identity even when token and API Key headers are present', async () => {
    const req = { headers: { token: 'login-token', authorization: 'Bearer test-key' } } as any;
    const target = MarkChatReadBodySchema.parse({
      outLinkAuthData: { shareId: 'share1', outLinkUid: 'user1' },
      chatId: 'chat1'
    });
    vi.mocked(authOutLink).mockResolvedValue({
      outLinkConfig: buildOutLinkConfig(),
      uid: 'user1',
      appId: 'app1'
    });
    vi.mocked(MongoChat.findOne).mockReturnValue({ lean: async () => null } as any);

    const result = await authChatTargetCrud({ req, authToken: true, authApiKey: true, ...target });

    expect(result.authType).toBe(AuthUserTypeEnum.outLink);
    expect(result.uid).toBe('user1');
    expect(authOutLink).toHaveBeenCalledWith({ req, shareId: 'share1', outLinkUid: 'user1' });
    expect(authApp).not.toHaveBeenCalled();
    expect(authSkill).not.toHaveBeenCalled();
  });

  it('does not fall back to token or API Key when external authentication fails', async () => {
    const target = MarkChatReadBodySchema.parse({
      outLinkAuthData: { shareId: 'share1', outLinkUid: 'user1' },
      chatId: 'chat1'
    });
    vi.mocked(authOutLink).mockRejectedValueOnce(ChatErrEnum.unAuthChat);

    await expect(
      authChatTargetCrud({
        req: { headers: { token: 'login-token', authorization: 'Bearer test-key' } } as any,
        authToken: true,
        authApiKey: true,
        ...target
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
    expect(authApp).not.toHaveBeenCalled();
    expect(authSkill).not.toHaveBeenCalled();
  });

  it('should pass requested app permission to app auth', async () => {
    vi.mocked(authApp).mockResolvedValue({
      teamId: 'team1',
      tmbId: 'tmb1',
      permission: new AppPermission({
        isOwner: true
      }),
      authType: AuthUserTypeEnum.token
    } as any);

    await authChatTargetCrud({
      req: {} as any,
      authToken: true,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app1',
      per: WritePermissionVal
    });

    expect(authApp).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: 'app1',
        per: WritePermissionVal
      })
    );
  });

  it('should auth skill edit target and query chat by source-aware condition', async () => {
    const mockChat = {
      appId: '507f1f77bcf86cd799439021',
      sourceType: ChatSourceTypeEnum.skillEdit,
      teamId: 'team1'
    };

    vi.mocked(authSkill).mockResolvedValue({
      teamId: 'team1',
      tmbId: 'tmb1',
      authType: AuthUserTypeEnum.token
    } as any);
    vi.mocked(MongoChat.findOne).mockReturnValue({
      lean: () => Promise.resolve(mockChat)
    } as any);

    const result = await authChatTargetCrud({
      req: {} as any,
      authToken: true,
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: '507f1f77bcf86cd799439021',
      chatId: 'chat1'
    });

    expect(authSkill).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: '507f1f77bcf86cd799439021'
      })
    );
    expect(MongoChat.findOne).toHaveBeenCalledWith({
      appId: '507f1f77bcf86cd799439021',
      sourceType: ChatSourceTypeEnum.skillEdit,
      chatId: 'chat1'
    });
    expect(result).toMatchObject({
      teamId: 'team1',
      tmbId: 'tmb1',
      uid: 'tmb1',
      chat: mockChat,
      showCite: true,
      showRunningStatus: true,
      showSkillReferences: true,
      showFullText: true,
      canDownloadSource: true
    });
  });

  it('should reject skill edit chat when chat team mismatches authorized skill team', async () => {
    vi.mocked(authSkill).mockResolvedValue({
      teamId: 'team1',
      tmbId: 'tmb1',
      authType: AuthUserTypeEnum.token
    } as any);
    vi.mocked(MongoChat.findOne).mockReturnValue({
      lean: () =>
        Promise.resolve({
          appId: '507f1f77bcf86cd799439021',
          sourceType: ChatSourceTypeEnum.skillEdit,
          teamId: 'other-team'
        })
    } as any);

    await expect(
      authChatTargetCrud({
        req: {} as any,
        authToken: true,
        sourceType: ChatSourceTypeEnum.skillEdit,
        sourceId: '507f1f77bcf86cd799439021',
        chatId: 'chat1'
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('should authorize workflow builder with app write permission and member-owned chat', async () => {
    const mockChat = {
      appId: '507f1f77bcf86cd799439021',
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      teamId: 'team1',
      tmbId: 'tmb1'
    };
    vi.mocked(authApp).mockResolvedValue({
      userId: 'user1',
      teamId: 'team1',
      tmbId: 'tmb1',
      permission: new AppPermission({ isOwner: true }),
      authType: AuthUserTypeEnum.token
    } as any);
    vi.mocked(MongoChat.findOne).mockReturnValue({
      lean: () => Promise.resolve(mockChat)
    } as any);

    const result = await authChatTargetCrud({
      req: {} as any,
      authToken: true,
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: '507f1f77bcf86cd799439021',
      chatId: 'chat1'
    });

    expect(authApp).toHaveBeenCalledWith(
      expect.objectContaining({
        appId: '507f1f77bcf86cd799439021',
        per: WritePermissionVal
      })
    );
    expect(MongoChat.findOne).toHaveBeenCalledWith({
      appId: '507f1f77bcf86cd799439021',
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      chatId: 'chat1'
    });
    expect(result).toMatchObject({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId: '507f1f77bcf86cd799439021',
      teamId: 'team1',
      tmbId: 'tmb1',
      uid: 'tmb1',
      chat: mockChat
    });
  });

  it('should reject workflow builder chat owned by another member', async () => {
    vi.mocked(authApp).mockResolvedValue({
      userId: 'user1',
      teamId: 'team1',
      tmbId: 'tmb1',
      permission: new AppPermission({ isOwner: true }),
      authType: AuthUserTypeEnum.token
    } as any);
    vi.mocked(MongoChat.findOne).mockReturnValue({
      lean: () =>
        Promise.resolve({
          appId: '507f1f77bcf86cd799439021',
          sourceType: ChatSourceTypeEnum.workflowBuilder,
          teamId: 'team1',
          tmbId: 'other-member'
        })
    } as any);

    await expect(
      authChatTargetCrud({
        req: {} as any,
        authToken: true,
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        sourceId: '507f1f77bcf86cd799439021',
        chatId: 'chat1'
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });
});

const params = { req: {} as any, authToken: true as const, sourceId: 'app-1' };

describe('authChatTargetCrud resource context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authApp).mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'member-1',
      userId: 'user-1',
      app: { name: 'App' },
      permission: new AppPermission({ role: 0 })
    } as any);
    vi.mocked(authSkill).mockResolvedValue({
      teamId: 'team-1',
      tmbId: 'member-1',
      skill: { name: 'Skill' }
    } as any);
    vi.mocked(MongoChat.findOne).mockReturnValue({ lean: async () => undefined } as any);
  });

  it('checks the resource once and permits a new chat without querying a chat record', async () => {
    const result = await authChatTargetCrud({
      ...params,
      sourceType: ChatSourceTypeEnum.workflowBuilder
    });
    expect(result).toMatchObject({
      scope: { teamId: 'team-1', tmbId: 'member-1' },
      chat: undefined,
      app: { name: 'App' }
    });
    expect(authApp).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ per: WritePermissionVal })
    );
    expect(MongoChat.findOne).not.toHaveBeenCalled();
  });

  it('does not treat a foreign Builder chat as a new conversation even with log permission', async () => {
    vi.mocked(authApp).mockResolvedValueOnce({
      teamId: 'team-1',
      tmbId: 'member-1',
      permission: new AppPermission({ isOwner: true })
    } as any);
    vi.mocked(MongoChat.findOne).mockReturnValueOnce({
      lean: async () => ({ teamId: 'team-1', tmbId: 'member-2' })
    } as any);
    await expect(
      authChatTargetCrud({
        ...params,
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        chatId: 'chat-1',
        per: ReadPermissionVal
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('limits ordinary members to their own App chats while permitting a missing chat ID', async () => {
    const target = { ...params, sourceType: ChatSourceTypeEnum.app, chatId: 'chat-1' };
    const newChat = await authChatTargetCrud(target);
    expect(newChat).toMatchObject({
      chat: undefined,
      scope: { teamId: 'team-1', tmbId: 'member-1' }
    });
    vi.mocked(MongoChat.findOne).mockReturnValueOnce({
      lean: async () => ({ teamId: 'team-1', tmbId: 'member-1' })
    } as any);
    await expect(authChatTargetCrud(target)).resolves.toMatchObject({ uid: 'member-1' });
    vi.mocked(MongoChat.findOne).mockReturnValueOnce({
      lean: async () => ({ teamId: 'team-1', tmbId: 'member-2' })
    } as any);
    await expect(authChatTargetCrud(target)).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it.each([ChatSourceTypeEnum.app, ChatSourceTypeEnum.chatAgentHelper])(
    'keeps log-reader access and file owner identity for %s',
    async (sourceType) => {
      vi.mocked(authApp).mockResolvedValueOnce({
        teamId: 'team-1',
        tmbId: 'member-1',
        userId: 'user-1',
        permission: new AppPermission({ isOwner: true })
      } as any);
      vi.mocked(MongoChat.findOne).mockReturnValueOnce({
        lean: async () => ({ teamId: 'team-1', tmbId: 'member-2', outLinkUid: 'external-user' })
      } as any);
      const result = await authChatTargetCrud({ ...params, sourceType, chatId: 'chat-1' });
      expect(result.scope).toEqual({ teamId: 'team-1' });
      expect(result.uid).toBe(sourceType === ChatSourceTypeEnum.app ? 'external-user' : 'member-2');
    }
  );

  it('keeps Skill chats team-scoped and uses the authenticated member for its identity', async () => {
    vi.mocked(MongoChat.findOne).mockReturnValueOnce({
      lean: async () => ({ teamId: 'team-1', tmbId: 'member-2' })
    } as any);
    const result = await authChatTargetCrud({
      ...params,
      sourceType: ChatSourceTypeEnum.skillEdit,
      chatId: 'chat-1'
    });
    expect(result).toMatchObject({
      uid: 'member-1',
      scope: { teamId: 'team-1' },
      skill: { name: 'Skill' }
    });
    expect(authApp).not.toHaveBeenCalled();
  });

  it('rejects helper access without an authenticated user and empty resource targets', async () => {
    vi.mocked(authApp).mockResolvedValueOnce({ teamId: 'team-1', tmbId: 'member-1' } as any);
    await expect(
      authChatTargetCrud({ ...params, sourceType: ChatSourceTypeEnum.chatAgentHelper })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
    await expect(
      authChatTargetCrud({ ...params, sourceType: ChatSourceTypeEnum.app, sourceId: '' })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
    expect(authApp).toHaveBeenCalledTimes(1);
  });
});

describe('assertChatAccess', () => {
  it.each([
    { chat: { teamId: 'team-2', tmbId: 'member-1' }, scope: { teamId: 'team-1' } },
    {
      chat: { teamId: 'team-1', tmbId: 'member-2' },
      scope: { teamId: 'team-1', tmbId: 'member-1' }
    }
  ])('rejects records outside the authorized scope: $chat', (params) => {
    expect(() => assertChatAccess(params)).toThrow(ChatErrEnum.unAuthChat);
  });
});
