import handler from '@/pages/api/core/chat/history/clearHistories';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, beforeEach } from 'vitest';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';

describe('clearHistories api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatIds: string[];

  beforeEach(async () => {
    testUser = await getUser('test-user-clear-histories');

    // Create test app
    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      modules: []
    });
    appId = String(app._id);
    // Create log permission
    await MongoResourcePermission.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      resourceId: appId,
      permission: AppReadChatLogPerVal,
      resourceType: PerResourceTypeEnum.app
    });

    // Create multiple chats
    chatIds = [getNanoid(), getNanoid(), getNanoid()];

    await Promise.all(
      chatIds.map((chatId) =>
        MongoChat.create({
          teamId: testUser.teamId,
          tmbId: testUser.tmbId,
          appId,
          chatId,
          source: ChatSourceEnum.online
        })
      )
    );
  });

  it('should clear all chat histories with token auth successfully', async () => {
    const res = await Call<any, any, any>(handler, {
      auth: testUser,
      query: {
        appId
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that all chats were soft deleted
    const chats = await MongoChat.find(
      {
        appId,
        chatId: { $in: chatIds }
      },
      { deleteTime: 1 }
    );

    chats.forEach((chat) => {
      expect(chat.deleteTime).toBeDefined();
      expect(chat.deleteTime).toBeInstanceOf(Date);
    });
  });

  it('should only clear chats for the specific user', async () => {
    // Create another user's chat
    const otherUser = await getUser('other-user-clear-histories');
    const otherChatId = getNanoid();

    await MongoChat.create({
      teamId: otherUser.teamId,
      tmbId: otherUser.tmbId,
      appId,
      chatId: otherChatId,
      source: ChatSourceEnum.online
    });

    // Clear current user's chats
    const res = await Call<any, any, any>(handler, {
      auth: testUser,
      query: {
        appId
      }
    });

    expect(res.code).toBe(200);

    // Verify that current user's chats were deleted
    const userChats = await MongoChat.find(
      {
        appId,
        chatId: { $in: chatIds }
      },
      { deleteTime: 1 }
    );

    userChats.forEach((chat) => {
      expect(chat.deleteTime).toBeDefined();
    });

    // Verify that other user's chat was NOT deleted
    const otherChat = await MongoChat.findOne(
      {
        appId,
        chatId: otherChatId
      },
      { deleteTime: 1 }
    );

    expect(otherChat?.deleteTime).toBeNull();
  });

  it('should filter by source when clearing API chats', async () => {
    // Create API source chat
    const apiChatId = getNanoid();
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId: apiChatId,
      source: ChatSourceEnum.api
    });

    // Clear with API key (simulated by authType in query)
    const res = await Call<any, any, any>(handler, {
      auth: { ...testUser, authType: 'apikey' },
      query: {
        appId
      }
    });

    expect(res.code).toBe(200);

    // Verify API chat was cleared
    const apiChat = await MongoChat.findOne(
      {
        appId,
        chatId: apiChatId
      },
      { deleteTime: 1 }
    );
    expect(apiChat?.deleteTime).toBeDefined();

    // Online chats should not be affected (different source)
    const onlineChats = await MongoChat.find(
      {
        appId,
        chatId: { $in: chatIds }
      },
      { deleteTime: 1 }
    );

    // Since we're using apikey auth, it will clear chats with api source
    // The online chats should not be affected
    onlineChats.forEach((chat) => {
      expect(chat.deleteTime).toBeNull();
    });
  });

  it('should fail when appId is missing', async () => {
    const res = await Call<any, any, any>(handler, {
      auth: testUser,
      query: {}
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when user does not have permission', async () => {
    const unauthorizedUser = await getUser('unauthorized-user-clear-histories');

    const res = await Call<any, any, any>(handler, {
      auth: unauthorizedUser,
      query: {
        appId
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should succeed even when there are no chats to clear', async () => {
    // Create a new app with no chats
    const newApp = await MongoApp.create({
      name: 'Empty App',
      type: AppTypeEnum.simple,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      modules: []
    });
    const emptyAppId = String(newApp._id);

    const res = await Call<any, any, any>(handler, {
      auth: testUser,
      query: {
        appId: emptyAppId
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();
  });
});
