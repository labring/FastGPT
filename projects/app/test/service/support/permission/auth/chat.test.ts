import { describe, expect, it, vi } from 'vitest';
import { authChatCrud, authCollectionInChat } from '@/service/support/permission/auth/chat';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { AuthUserTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { authOutLink } from '@/service/support/permission/auth/outLink';

vi.mock('@fastgpt/service/core/chat/chatSchema', () => ({
  MongoChat: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/chat/chatItemSchema', () => ({
  MongoChatItem: {
    findOne: vi.fn()
  }
}));

vi.mock('@fastgpt/service/support/permission/app/auth');
vi.mock('@/service/support/permission/auth/outLink');

describe('authChatCrud', () => {
  it('should reject if no appId provided', async () => {
    await expect(authChatCrud({ appId: '' })).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('should auth outLink without chatId', async () => {
    vi.mocked(authOutLink).mockResolvedValue({
      outLinkConfig: {
        teamId: 'team1',
        tmbId: 'tmb1',
        responseDetail: true,
        showNodeStatus: true,
        showRawSource: true
      },
      uid: 'user1',
      appId: 'app1'
    });

    const result = await authChatCrud({
      appId: 'app1',
      shareId: 'share1',
      outLinkUid: 'user1'
    });

    expect(result).toMatchObject({
      teamId: 'team1',
      tmbId: 'tmb1',
      uid: 'user1',
      responseDetail: true,
      showNodeStatus: true,
      showRawSource: true,
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
        responseDetail: true,
        showNodeStatus: true,
        showRawSource: true
      },
      uid: 'user1',
      appId: 'app1'
    });

    vi.mocked(MongoChat.findOne).mockReturnValue({
      lean: () => mockChat
    } as any);

    const result = await authChatCrud({
      appId: 'app1',
      chatId: 'chat1',
      shareId: 'share1',
      outLinkUid: 'user1'
    });

    expect(result).toMatchObject({
      teamId: 'team1',
      tmbId: 'tmb1',
      uid: 'user1',
      chat: mockChat,
      responseDetail: true,
      showNodeStatus: true,
      showRawSource: true,
      authType: AuthUserTypeEnum.outLink
    });
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
        outLinkUid: 'user1'
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
  });

  it('should auth with cookie', async () => {
    vi.mocked(authApp).mockResolvedValue({
      teamId: 'team1',
      tmbId: 'tmb1',
      permission: {
        hasManagePer: true
      },
      authType: AuthUserTypeEnum.team
    });

    const result = await authChatCrud({
      appId: 'app1',
      req: {} as any
    });

    expect(result).toEqual({
      teamId: 'team1',
      tmbId: 'tmb1',
      uid: 'tmb1',
      responseDetail: true,
      showNodeStatus: true,
      showRawSource: true,
      authType: AuthUserTypeEnum.team
    });
  });
});

describe('authCollectionInChat', () => {
  it('should reject if chat item not found', async () => {
    vi.mocked(MongoChatItem.findOne).mockReturnValue({
      lean: () => null
    } as any);

    await expect(
      authCollectionInChat({
        collectionIds: ['col1'],
        appId: 'app1',
        chatId: 'chat1',
        chatItemDataId: 'item1'
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetCollection);
  });

  it('should auth collection ids in chat item', async () => {
    const mockChatItem = {
      time: new Date(),
      responseData: [
        {
          quoteList: [{ collectionId: 'col1' }, { collectionId: 'col2' }]
        }
      ]
    };

    vi.mocked(MongoChatItem.findOne).mockReturnValue({
      lean: () => mockChatItem
    } as any);

    const result = await authCollectionInChat({
      collectionIds: ['col1', 'col2'],
      appId: 'app1',
      chatId: 'chat1',
      chatItemDataId: 'item1'
    });

    expect(result).toEqual({
      chatItem: mockChatItem
    });
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
      lean: () => mockChatItem
    } as any);

    const result = await authCollectionInChat({
      collectionIds: ['col1', 'col2', 'col3', 'col4'],
      appId: 'app1',
      chatId: 'chat1',
      chatItemDataId: 'item1'
    });

    expect(result).toEqual({
      chatItem: mockChatItem
    });
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
      lean: () => mockChatItem
    } as any);

    await expect(
      authCollectionInChat({
        collectionIds: ['col2'],
        appId: 'app1',
        chatId: 'chat1',
        chatItemDataId: 'item1'
      })
    ).rejects.toBe(DatasetErrEnum.unAuthDatasetFile);
  });
});
