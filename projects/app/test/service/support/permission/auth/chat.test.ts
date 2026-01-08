import { describe, expect, it, vi, beforeEach } from 'vitest';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authOutLink } from '@/service/support/permission/auth/outLink';
import { authTeamSpaceToken } from '@/service/support/permission/auth/team';
import { getFlatAppResponses } from '@/global/core/chat/utils';
import { AppPermission } from '@fastgpt/global/support/permission/app/controller';

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: {
    findOne: vi.fn(),
    find: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/chat/chatItemResponseSchema', () => ({
  MongoChatItemResponse: {
    find: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/app/auth');
vi.mock('@/service/support/permission/auth/outLink');
vi.mock('@/service/support/permission/auth/team');
vi.mock('@/global/core/chat/utils');

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
        tmbId: 'tmb1'
      });

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
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.teamDomain
      });
    });

    it('should auth with teamId and teamToken with valid chatId', async () => {
      const mockChat = {
        appId: 'app1',
        outLinkUid: 'user1',
        teamId: 'team1'
      };

      vi.mocked(authTeamSpaceToken).mockResolvedValue({
        uid: 'user1',
        tmbId: 'tmb1'
      });
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
        showFullText: true,
        canDownloadSource: true,
        authType: AuthUserTypeEnum.teamDomain
      });
    });

    it('should handle missing chat for teamDomain auth', async () => {
      vi.mocked(authTeamSpaceToken).mockResolvedValue({
        uid: 'user1',
        tmbId: 'tmb1'
      });
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
        tmbId: 'tmb1'
      });
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
        outLinkConfig: {
          teamId: 'team1',
          tmbId: 'tmb1',
          showCite: true,
          showRunningStatus: true,
          canDownloadSource: true
        },
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
        outLinkConfig: {
          teamId: 'team1',
          tmbId: 'tmb1',
          showCite: false,
          shareId: 'share1',
          outLinkUid: 'user1'
        },
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
        outLinkConfig: {
          teamId: 'team1',
          tmbId: 'tmb1',
          showCite: true,
          showRunningStatus: true,
          canDownloadSource: true
        },
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
        outLinkConfig: {
          teamId: 'team1',
          tmbId: 'tmb1',
          showCite: true,
          showRunningStatus: false,
          canDownloadSource: true
        },
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
        outLinkConfig: {
          teamId: 'team1',
          tmbId: 'tmb1',
          showCite: true,
          showFullText: true,
          showRunningStatus: true,
          canDownloadSource: true
        },
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
        outLinkConfig: {
          teamId: 'team1',
          tmbId: 'tmb1'
        },
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
        uid: 'tmb1',
        chat: mockChat,
        showCite: true,
        showRunningStatus: true,
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
  });

  describe('validation', () => {
    it('should reject if chat item not found', async () => {
      // Mock the find method to return empty array (no cite collection ids found)
      vi.mocked(MongoChatItem.find).mockReturnValue({
        sort: () => ({
          limit: () => ({
            lean: () => Promise.resolve([])
          })
        })
      } as any);

      vi.mocked(MongoChatItem.findOne).mockReturnValue({
        lean: () => Promise.resolve(null)
      } as any);

      await expect(
        authCollectionInChat({
          collectionIds: ['col1'],
          appId: 'app1',
          chatId: 'chat1',
          chatItemDataId: 'item1'
        })
      ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
    });

    it('should reject with empty collectionIds array', async () => {
      // Mock the find method to return empty array (no cite collection ids found)
      vi.mocked(MongoChatItem.find).mockReturnValue({
        sort: () => ({
          limit: () => ({
            lean: () => Promise.resolve([])
          })
        })
      } as any);

      const mockChatItem = {
        time: new Date(),
        responseData: []
      };

      vi.mocked(MongoChatItem.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChatItem)
      } as any);
      vi.mocked(MongoChatItemResponse.find).mockReturnValue({
        lean: () => Promise.resolve([])
      } as any);
      vi.mocked(getFlatAppResponses).mockReturnValue([]);

      const result = await authCollectionInChat({
        collectionIds: [],
        appId: 'app1',
        chatId: 'chat1',
        chatItemDataId: 'item1'
      });

      expect(result).toEqual(undefined);
    });

    it('should handle missing appId, chatId, or chatItemDataId', async () => {
      await expect(
        authCollectionInChat({
          collectionIds: ['col1'],
          appId: '',
          chatId: 'chat1',
          chatItemDataId: 'item1'
        })
      ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
    });
  });

  describe('response data handling', () => {
    it('should auth collection ids in chat item with existing responseData', async () => {
      // Mock the find method to return empty array (no cite collection ids found)
      vi.mocked(MongoChatItem.find).mockReturnValue({
        sort: () => ({
          limit: () => ({
            lean: () => Promise.resolve([])
          })
        })
      } as any);

      const mockChatItem = {
        time: new Date(),
        citeCollectionIds: ['col1', 'col2']
      };

      vi.mocked(MongoChatItem.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChatItem)
      } as any);
      vi.mocked(getFlatAppResponses).mockReturnValue([
        { quoteList: [{ collectionId: 'col1' }, { collectionId: 'col2' }] }
      ]);

      const result = await authCollectionInChat({
        collectionIds: ['col1', 'col2'],
        appId: 'app1',
        chatId: 'chat1',
        chatItemDataId: 'item1'
      });

      expect(result).toEqual(undefined);
    });

    it('should fetch responseData from MongoChatItemResponse when missing', async () => {
      const mockChatItem = {
        time: new Date(),
        citeCollectionIds: ['col1', 'col2']
      };
      const mockChatItemResponses = [
        { data: { quoteList: [{ collectionId: 'col1' }] } },
        { data: { quoteList: [{ collectionId: 'col2' }] } }
      ];

      vi.mocked(MongoChatItem.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChatItem)
      } as any);
      vi.mocked(MongoChatItemResponse.find).mockReturnValue({
        lean: () => Promise.resolve(mockChatItemResponses)
      } as any);
      vi.mocked(getFlatAppResponses).mockReturnValue([
        { quoteList: [{ collectionId: 'col1' }] },
        { quoteList: [{ collectionId: 'col2' }] }
      ]);

      const result = await authCollectionInChat({
        collectionIds: ['col1', 'col2'],
        appId: 'app1',
        chatId: 'chat1',
        chatItemDataId: 'item1'
      });

      expect(mockChatItem.responseData).toEqual([
        { quoteList: [{ collectionId: 'col1' }] },
        { quoteList: [{ collectionId: 'col2' }] }
      ]);
      expect(result).toEqual(undefined);
    });

    it('should handle empty responseData array', async () => {
      const mockChatItem = {
        time: new Date(),
        responseData: []
      };

      vi.mocked(MongoChatItem.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChatItem)
      } as any);
      vi.mocked(MongoChatItemResponse.find).mockReturnValue({
        lean: () => Promise.resolve([])
      } as any);
      vi.mocked(getFlatAppResponses).mockReturnValue([]);

      await expect(
        authCollectionInChat({
          collectionIds: ['col1'],
          appId: 'app1',
          chatId: 'chat1',
          chatItemDataId: 'item1'
        })
      ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
    });

    it('should handle plugin, tool and loop details in response data', async () => {
      const mockChatItem = {
        time: new Date(),
        responseData: [
          {
            quoteList: [{ collectionId: 'col1' }],
            pluginDetail: [
              {
                quoteList: [{ collectionId: 'col2' }]
              }
            ],
            toolDetail: [
              {
                quoteList: [{ collectionId: 'col3' }]
              }
            ],
            loopDetail: [
              {
                quoteList: [{ collectionId: 'col4' }]
              }
            ]
          }
        ]
      };

      vi.mocked(MongoChatItem.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChatItem)
      } as any);
      vi.mocked(getFlatAppResponses).mockReturnValue([
        { quoteList: [{ collectionId: 'col1' }] },
        { quoteList: [{ collectionId: 'col2' }] },
        { quoteList: [{ collectionId: 'col3' }] },
        { quoteList: [{ collectionId: 'col4' }] }
      ]);

      const result = await authCollectionInChat({
        collectionIds: ['col1', 'col2', 'col3', 'col4'],
        appId: 'app1',
        chatId: 'chat1',
        chatItemDataId: 'item1'
      });

      expect(result).toEqual(undefined);
    });

    it('should reject if collection ids not found in quotes', async () => {
      const mockChatItem = {
        time: new Date(),
        responseData: [
          {
            quoteList: [{ collectionId: 'col1' }]
          }
        ]
      };

      vi.mocked(MongoChatItem.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChatItem)
      } as any);
      vi.mocked(getFlatAppResponses).mockReturnValue([{ quoteList: [{ collectionId: 'col1' }] }]);

      await expect(
        authCollectionInChat({
          collectionIds: ['col2'],
          appId: 'app1',
          chatId: 'chat1',
          chatItemDataId: 'item1'
        })
      ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
    });

    it('should reject if only some collection ids are found', async () => {
      const mockChatItem = {
        time: new Date(),
        responseData: [
          {
            quoteList: [{ collectionId: 'col1' }, { collectionId: 'col2' }]
          }
        ]
      };

      vi.mocked(MongoChatItem.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChatItem)
      } as any);
      vi.mocked(getFlatAppResponses).mockReturnValue([
        { quoteList: [{ collectionId: 'col1' }, { collectionId: 'col2' }] }
      ]);

      await expect(
        authCollectionInChat({
          collectionIds: ['col1', 'col2', 'col3'], // col3 not found
          appId: 'app1',
          chatId: 'chat1',
          chatItemDataId: 'item1'
        })
      ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
    });

    it('should handle quotes with missing collectionId', async () => {
      const mockChatItem = {
        time: new Date(),
        responseData: [
          {
            quoteList: [
              { collectionId: 'col1' },
              {
                /* missing collectionId */
              }
            ]
          }
        ]
      };

      vi.mocked(MongoChatItem.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChatItem)
      } as any);
      vi.mocked(getFlatAppResponses).mockReturnValue([
        { quoteList: [{ collectionId: 'col1' }, {}] }
      ]);

      const result = await authCollectionInChat({
        collectionIds: ['col1'],
        appId: 'app1',
        chatId: 'chat1',
        chatItemDataId: 'item1'
      });

      expect(result).toEqual(undefined);
    });

    it('should handle missing quoteList in response data', async () => {
      const mockChatItem = {
        time: new Date(),
        responseData: [
          {
            // no quoteList
          }
        ]
      };

      vi.mocked(MongoChatItem.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChatItem)
      } as any);
      vi.mocked(getFlatAppResponses).mockReturnValue([]);

      await expect(
        authCollectionInChat({
          collectionIds: ['col1'],
          appId: 'app1',
          chatId: 'chat1',
          chatItemDataId: 'item1'
        })
      ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
    });
  });

  describe('error handling', () => {
    it('should reject if database query throws error', async () => {
      vi.mocked(MongoChatItem.findOne).mockImplementation(() => {
        throw new Error('Database error');
      });

      await expect(
        authCollectionInChat({
          collectionIds: ['col1'],
          appId: 'app1',
          chatId: 'chat1',
          chatItemDataId: 'item1'
        })
      ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
    });

    it('should reject if getFlatAppResponses throws error', async () => {
      const mockChatItem = {
        time: new Date(),
        responseData: [{}]
      };

      vi.mocked(MongoChatItem.findOne).mockReturnValue({
        lean: () => Promise.resolve(mockChatItem)
      } as any);
      vi.mocked(getFlatAppResponses).mockImplementation(() => {
        throw new Error('Processing error');
      });

      await expect(
        authCollectionInChat({
          collectionIds: ['col1'],
          appId: 'app1',
          chatId: 'chat1',
          chatItemDataId: 'item1'
        })
      ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
    });
  });
});
