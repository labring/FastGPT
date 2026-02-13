import handler from '@/pages/api/core/chat/history/getHistories';
import type {
  GetHistoriesBodyType,
  GetHistoriesResponseType
} from '@fastgpt/global/openapi/core/chat/history/api';
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

describe('getHistories api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatIds: string[];

  beforeEach(async () => {
    testUser = await getUser('test-user-get-histories');

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
    // Create multiple chats with different attributes
    chatIds = [getNanoid(), getNanoid(), getNanoid()];

    await Promise.all([
      MongoChat.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        appId,
        chatId: chatIds[0],
        source: ChatSourceEnum.online,
        title: 'Chat 1',
        top: true
      }),
      MongoChat.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        appId,
        chatId: chatIds[1],
        source: ChatSourceEnum.online,
        title: 'Chat 2',
        customTitle: 'Custom Chat 2'
      }),
      MongoChat.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        appId,
        chatId: chatIds[2],
        source: ChatSourceEnum.online,
        title: 'Chat 3'
      })
    ]);
  });

  it('should get chat histories successfully', async () => {
    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId
      },
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();
    expect(res.data).toBeDefined();
    expect(res.data.list).toHaveLength(3);
    expect(res.data.total).toBe(3);

    // Verify top chat is first
    expect(res.data.list[0].top).toBe(true);
  });

  it('should return paginated results', async () => {
    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId
      },
      query: {
        offset: 0,
        pageSize: 2
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(2);
    expect(res.data.total).toBe(3);

    // Get second page
    const res2 = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId
      },
      query: {
        offset: 2,
        pageSize: 2
      }
    });

    expect(res2.code).toBe(200);
    expect(res2.data.list).toHaveLength(1);
    expect(res2.data.total).toBe(3);
  });

  it('should filter by source', async () => {
    // Create API source chat
    const apiChatId = getNanoid();
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId: apiChatId,
      source: ChatSourceEnum.api,
      title: 'API Chat'
    });

    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId,
        source: ChatSourceEnum.api
      },
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(1);
    expect(res.data.list[0].chatId).toBe(apiChatId);
  });

  it('should filter by createTime range', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId,
        startCreateTime: yesterday.toISOString(),
        endCreateTime: tomorrow.toISOString()
      },
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(3);
  });

  it('should filter by updateTime range', async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId,
        startUpdateTime: yesterday.toISOString(),
        endUpdateTime: tomorrow.toISOString()
      },
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(3);
  });

  it('should exclude soft-deleted chats', async () => {
    // Soft delete one chat
    await MongoChat.updateOne({ appId, chatId: chatIds[0] }, { deleteTime: new Date() });

    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId
      },
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(2);
    expect(res.data.total).toBe(2);
    expect(res.data.list.find((chat) => chat.chatId === chatIds[0])).toBeUndefined();
  });

  it('should only return chats for the specific user', async () => {
    // Create another user's chat
    const otherUser = await getUser('other-user-get-histories');
    const otherChatId = getNanoid();

    // Create app for other user
    const otherApp = await MongoApp.create({
      name: 'Other App',
      type: AppTypeEnum.simple,
      teamId: otherUser.teamId,
      tmbId: otherUser.tmbId,
      modules: []
    });

    await MongoChat.create({
      teamId: otherUser.teamId,
      tmbId: otherUser.tmbId,
      appId: String(otherApp._id),
      chatId: otherChatId,
      source: ChatSourceEnum.online,
      title: 'Other User Chat'
    });

    // Get current user's chats
    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId
      },
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(3);
    expect(res.data.list.find((chat) => chat.chatId === otherChatId)).toBeUndefined();
  });

  it('should return empty list when appId does not exist', async () => {
    const nonExistentAppId = '507f1f77bcf86cd799439011'; // Valid ObjectId format but non-existent

    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId: nonExistentAppId
      },
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
    expect(res.data.total).toBe(0);
  });

  it('should fail when appId is missing', async () => {
    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {},
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
  });

  it('should include all required fields in response', async () => {
    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId
      },
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);

    const firstChat = res.data.list[0];
    expect(firstChat).toHaveProperty('chatId');
    expect(firstChat).toHaveProperty('updateTime');
    expect(firstChat).toHaveProperty('appId');
    expect(firstChat).toHaveProperty('title');
    expect(firstChat.appId).toBe(appId);
  });

  it('should order by top and updateTime', async () => {
    // Update one chat to be newer
    await new Promise((resolve) => setTimeout(resolve, 10));
    await MongoChat.updateOne({ appId, chatId: chatIds[2] }, { updateTime: new Date() });

    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId
      },
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);

    // First should be the top chat
    expect(res.data.list[0].chatId).toBe(chatIds[0]);

    // Second should be the most recently updated non-top chat
    expect(res.data.list[1].chatId).toBe(chatIds[2]);
  });

  it('should return empty list when appId format is invalid', async () => {
    const invalidAppId = 'invalid-app-id'; // Not a valid ObjectId format

    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId: invalidAppId
      },
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
    expect(res.data.total).toBe(0);
  });

  it('should accept empty string for appId and return empty list', async () => {
    const res = await Call<GetHistoriesBodyType, any, GetHistoriesResponseType>(handler, {
      auth: testUser,
      body: {
        appId: ''
      },
      query: {
        offset: 0,
        pageSize: 10
      }
    });

    expect(res.code).toBe(200);
    expect(res.data.list).toHaveLength(0);
    expect(res.data.total).toBe(0);
  });
});
