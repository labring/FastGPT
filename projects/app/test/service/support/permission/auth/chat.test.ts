import { describe, expect, it, vi, beforeEach } from 'vitest';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';
import { PublishChannelEnum } from '@fastgpt/global/support/outLink/constant';
import type { OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { Types } from 'mongoose';

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: {
    aggregate: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/app/schema', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/app/schema')>();
  return {
    ...actual,
    MongoApp: {
      findOne: vi.fn()
    }
  };
});

vi.mock('@fastgpt/service/support/permission/app/auth');
vi.mock('@/service/support/permission/auth/outLink');
vi.mock('@/service/support/permission/auth/team');

const buildOutLinkConfig = (
  overrides: Partial<OutLinkSchemaType> = {},
  omitKeys: (keyof OutLinkSchemaType)[] = []
): OutLinkSchemaType => {
  const config: OutLinkSchemaType = {
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
    app: undefined,
    ...overrides
  };

  omitKeys.forEach((key) => {
    delete (config as Partial<OutLinkSchemaType>)[key];
  });

  return config;
};

describe('authChatCrud', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validation', () => {
    it('should reject if appId is empty string', async () => {
      await expect(authChatCrud({ appId: '', req: {} as any, authToken: true })).rejects.toBe(
        ChatErrEnum.unAuthChat
      );
    });

    it('should reject if appId is undefined', async () => {
      await expect(
        authChatCrud({ appId: undefined as any, req: {} as any, authToken: true })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });

    it('should reject if appId is null', async () => {
      await expect(
        authChatCrud({ appId: null as any, req: {} as any, authToken: true })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });
  });

  describe('teamDomain authentication', () => {
    it('should auth with teamId and teamToken without chatId', async () => {
      vi.mocked(authTeamSpaceToken).mockResolvedValue({
        uid: 'user1',
        tmbId: 'tmb1',
        tags: ['tag1']
      });
      vi.mocked(MongoApp.findOne).mockReturnValue({
        lean: () => Promise.resolve({ _id: 'app1', teamId: 'team1' })
      } as any);

      const result = await authChatCrud({
        appId: 'app1',
        teamId: 'team1',
        teamToken: 'token1',
        req: {} as any,
        authToken: true
      });

      expect(result).toEqual({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'user1',
        showCite: true,
        showRunningStatus: true,
        showSkillReferences: true,
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.teamDomain
      });
    });

    it('should reject if app does not belong to team or tags mismatch', async () => {
      vi.mocked(authTeamSpaceToken).mockResolvedValue({
        uid: 'user1',
        tmbId: 'tmb1',
        tags: ['tag1']
      });
      vi.mocked(MongoApp.findOne).mockReturnValue({
        lean: () => Promise.resolve(null)
      } as any);

      await expect(
        authChatCrud({
          appId: 'app1',
          teamId: 'team1',
          teamToken: 'token1',
          req: {} as any,
          authToken: true
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });

    it('should auth with teamId and teamToken with valid chatId', async () => {
      const mockChat = {
        appId: 'app1',
        outLinkUid: 'user1',
        teamId: 'team1'
      };

      vi.mocked(authTeamSpaceToken).mockResolvedValue({
        uid: 'user1',
        tmbId: 'tmb1',
        tags: ['tag1']
      });
      vi.mocked(MongoApp.findOne).mockReturnValue({
        lean: () => Promise.resolve({ _id: 'app1', teamId: 'team1' })
      } as any);
      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      const result = await authChatCrud({
        appId: 'app1',
        chatId: 'chat1',
        teamId: 'team1',
        teamToken: 'token1',
        req: {} as any,
        authToken: true
      });

      expect(result).toEqual({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'user1',
        chat: mockChat,
        showCite: true,
        showRunningStatus: true,
        showSkillReferences: true,
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.teamDomain
      });
    });

    it('should handle missing chat for teamDomain auth', async () => {
      vi.mocked(authTeamSpaceToken).mockResolvedValue({
        uid: 'user1',
        tmbId: 'tmb1',
        tags: ['tag1']
      });
      vi.mocked(MongoApp.findOne).mockReturnValue({
        lean: () => Promise.resolve({ _id: 'app1', teamId: 'team1' })
      } as any);
      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(null)
      } as any);

      const result = await authChatCrud({
        appId: 'app1',
        chatId: 'chat1',
        teamId: 'team1',
        teamToken: 'token1',
        req: {} as any,
        authToken: true
      });

      expect(result).toEqual({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'user1',
        showCite: true,
        showRunningStatus: true,
        showSkillReferences: true,
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.teamDomain
      });
    });

    it('should reject if chat outLinkUid does not match user for teamDomain', async () => {
      const mockChat = {
        appId: 'app1',
        outLinkUid: 'different-user',
        teamId: 'team1'
      };

      vi.mocked(authTeamSpaceToken).mockResolvedValue({
        uid: 'user1',
        tmbId: 'tmb1',
        tags: ['tag1']
      });
      vi.mocked(MongoApp.findOne).mockReturnValue({
        lean: () => Promise.resolve({ _id: 'app1', teamId: 'team1' })
      } as any);
      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      await expect(
        authChatCrud({
          appId: 'app1',
          chatId: 'chat1',
          teamId: 'team1',
          teamToken: 'token1',
          req: {} as any,
          authToken: true
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
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

      const result = await authChatCrud({
        appId: 'app1',
        shareId: 'share1',
        outLinkUid: 'user1',
        req: {} as any,
        authToken: true
      });

      expect(result).toMatchObject({
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

      const result = await authChatCrud({
        appId: 'app1',
        shareId: 'share1',
        outLinkUid: 'user1',
        req: {} as any,
        authToken: true
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

      const result = await authChatCrud({
        appId: 'app1',
        chatId: 'chat1',
        shareId: 'share1',
        outLinkUid: 'user1',
        req: {} as any,
        authToken: true
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

      const result = await authChatCrud({
        appId: 'app1',
        chatId: 'chat1',
        shareId: 'share1',
        outLinkUid: 'user1',
        req: {} as any,
        authToken: true
      });

      expect(result).toEqual({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'user1',
        showCite: true,
        showRunningStatus: false,
        showSkillReferences: false,
        showFullText: false,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.outLink
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
        authChatCrud({
          appId: 'app1',
          chatId: 'chat1',
          shareId: 'share1',
          outLinkUid: 'user1',
          req: {} as any,
          authToken: true
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
        authChatCrud({
          appId: 'app1',
          shareId: 'share1',
          outLinkUid: 'user1',
          req: {} as any,
          authToken: true
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });

    it('should reject if shareId provided without outLinkUid', async () => {
      // Mock authApp to simulate what happens when req is provided but shareId/outLinkUid combo is incomplete
      vi.mocked(authApp).mockRejectedValue(new Error('Auth failed'));

      await expect(
        authChatCrud({
          appId: 'app1',
          shareId: 'share1',
          req: {} as any,
          authToken: true
        })
      ).rejects.toThrow();
    });

    it('should reject if outLinkUid provided without shareId', async () => {
      // Mock authApp to simulate what happens when req is provided but shareId/outLinkUid combo is incomplete
      vi.mocked(authApp).mockRejectedValue(new Error('Auth failed'));

      await expect(
        authChatCrud({
          appId: 'app1',
          outLinkUid: 'user1',
          req: {} as any,
          authToken: true
        })
      ).rejects.toThrow();
    });
  });

  describe('cookie authentication', () => {
    it('should auth with cookie without chatId', async () => {
      vi.mocked(authApp).mockResolvedValue({
        teamId: 'team1',
        tmbId: 'tmb1',
        permission: new AppPermission({
          isOwner: true
        }),
        authType: AuthUserTypeEnum.teamDomain
      } as any);

      const result = await authChatCrud({
        appId: 'app1',
        req: {} as any,
        authToken: true
      });

      expect(result).toEqual({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'tmb1',
        showCite: true,
        showRunningStatus: true,
        showSkillReferences: true,
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.teamDomain
      });
    });

    it('should auth with cookie and valid chatId for same team', async () => {
      const mockChat = {
        appId: 'app1',
        teamId: 'team1',
        tmbId: 'tmb1'
      };

      vi.mocked(authApp).mockResolvedValue({
        teamId: 'team1',
        tmbId: 'tmb1',
        permission: new AppPermission({
          isOwner: true
        }),
        authType: AuthUserTypeEnum.teamDomain
      } as any);

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      const result = await authChatCrud({
        appId: 'app1',
        chatId: 'chat1',
        req: {} as any,
        authToken: true
      });

      expect(result).toEqual({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'tmb1',
        chat: mockChat,
        showCite: true,
        showRunningStatus: true,
        showSkillReferences: true,
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.teamDomain
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
        authType: AuthUserTypeEnum.teamDomain
      } as any);

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      const result = await authChatCrud({
        appId: 'app1',
        chatId: 'chat1',
        req: {} as any,
        authToken: true
      });

      expect(result).toEqual({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'different-tmb',
        chat: mockChat,
        showCite: true,
        showRunningStatus: true,
        showSkillReferences: true,
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.teamDomain
      });
    });

    it('should handle missing chat for cookie auth', async () => {
      vi.mocked(authApp).mockResolvedValue({
        teamId: 'team1',
        tmbId: 'tmb1',
        permission: new AppPermission({
          isOwner: true
        }),
        authType: AuthUserTypeEnum.teamDomain
      } as any);

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(null)
      } as any);

      const result = await authChatCrud({
        appId: 'app1',
        chatId: 'chat1',
        req: {} as any,
        authToken: true
      });

      expect(result).toEqual({
        teamId: 'team1',
        tmbId: 'tmb1',
        uid: 'tmb1',
        showCite: true,
        showRunningStatus: true,
        showSkillReferences: true,
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.teamDomain
      });
    });

    it('should reject if chat belongs to different team', async () => {
      const mockChat = {
        appId: 'app1',
        teamId: 'different-team',
        tmbId: 'tmb1'
      };

      vi.mocked(authApp).mockResolvedValue({
        teamId: 'team1',
        tmbId: 'tmb1',
        permission: new AppPermission({
          isOwner: true
        }),
        authType: AuthUserTypeEnum.teamDomain
      } as any);

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      await expect(
        authChatCrud({
          appId: 'app1',
          chatId: 'chat1',
          req: {} as any,
          authToken: true
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
        authType: AuthUserTypeEnum.teamDomain
      } as any);

      vi.mocked(MongoChat.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChat)
      } as any);

      await expect(
        authChatCrud({
          appId: 'app1',
          chatId: 'chat1',
          req: {} as any,
          authToken: true
        })
      ).rejects.toBe(ChatErrEnum.unAuthChat);
    });
  });
});

describe('authCollectionInChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(MongoChatItem.aggregate).mockResolvedValue([]);
  });

  it('should authorize when aggregation confirms all collection ids are cited', async () => {
    vi.mocked(MongoChatItem.aggregate).mockResolvedValue([{ isAuthorized: true }]);

    const result = await authCollectionInChat({
      collectionIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
      appId: '507f1f77bcf86cd799439010',
      chatId: 'chat1'
    });

    expect(result).toBeUndefined();
  });

  it('should reject when aggregation does not confirm all collection ids', async () => {
    vi.mocked(MongoChatItem.aggregate).mockResolvedValue([{ isAuthorized: false }]);

    await expect(
      authCollectionInChat({
        collectionIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
        appId: '507f1f77bcf86cd799439010',
        chatId: 'chat1'
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
  });

  it('should reject when aggregation returns no result', async () => {
    vi.mocked(MongoChatItem.aggregate).mockResolvedValue([]);

    await expect(
      authCollectionInChat({
        collectionIds: ['507f1f77bcf86cd799439011'],
        appId: '507f1f77bcf86cd799439010',
        chatId: 'chat1'
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
  });

  it('should cast appId and compare stored citeCollectionIds as strings', async () => {
    vi.mocked(MongoChatItem.aggregate).mockResolvedValue([{ isAuthorized: true }]);
    const appId = '507f1f77bcf86cd799439010';
    const collectionIds = ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'];

    await authCollectionInChat({
      collectionIds,
      appId,
      chatId: 'chat1'
    });

    const pipeline = vi.mocked(MongoChatItem.aggregate).mock.calls[0][0];

    expect(pipeline[0]).toEqual({
      $match: {
        appId: new Types.ObjectId(appId),
        chatId: 'chat1',
        obj: 'AI'
      }
    });
    expect(pipeline).toContainEqual({ $sort: { _id: -1 } });
    expect(pipeline).toContainEqual({ $limit: 50 });
    expect(pipeline).toContainEqual({ $unwind: '$citeCollectionIds' });
    expect(pipeline).toContainEqual({
      $group: {
        _id: null,
        citeCollectionIds: { $addToSet: { $toString: '$citeCollectionIds' } }
      }
    });
    expect(pipeline).toContainEqual({
      $project: {
        _id: 0,
        isAuthorized: {
          $setIsSubset: [collectionIds, '$citeCollectionIds']
        }
      }
    });
  });
});
