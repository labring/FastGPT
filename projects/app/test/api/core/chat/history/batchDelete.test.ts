import handler from '@/pages/api/core/chat/history/batchDelete';
import type { ChatBatchDeleteBodyType } from '@fastgpt/global/openapi/core/chat/history/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, beforeEach } from 'vitest';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';

describe('batchDelete api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatIds: string[];

  beforeEach(async () => {
    testUser = await getUser('test-user-batch-delete');

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
          source: ChatSourceEnum.test,
          title: `Test Chat ${chatId}`
        })
      )
    );

    // Create chat items for each chat
    await Promise.all(
      chatIds.map((chatId) =>
        MongoChatItem.create({
          teamId: testUser.teamId,
          tmbId: testUser.tmbId,
          userId: testUser.userId,
          appId,
          chatId,
          dataId: getNanoid(),
          obj: ChatRoleEnum.AI,
          value: [
            {
              type: 'text',
              text: {
                content: `Response for ${chatId}`
              }
            }
          ]
        })
      )
    );

    // Create chat item responses for each chat
    await Promise.all(
      chatIds.map((chatId) =>
        MongoChatItemResponse.create({
          teamId: testUser.teamId,
          tmbId: testUser.tmbId,
          appId,
          chatId,
          dataId: getNanoid(),
          text: `Response text for ${chatId}`
        })
      )
    );
  });

  it('should batch delete multiple chats successfully', async () => {
    const deleteIds = [chatIds[0], chatIds[1]];

    const res = await Call<ChatBatchDeleteBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatIds: deleteIds
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that chats were deleted
    const remainingChats = await MongoChat.find({
      appId,
      chatId: { $in: deleteIds }
    });
    expect(remainingChats).toHaveLength(0);

    // Verify that chat items were deleted
    const remainingChatItems = await MongoChatItem.find({
      appId,
      chatId: { $in: deleteIds }
    });
    expect(remainingChatItems).toHaveLength(0);

    // Verify that chat item responses were deleted
    const remainingChatItemResponses = await MongoChatItemResponse.find({
      appId,
      chatId: { $in: deleteIds }
    });
    expect(remainingChatItemResponses).toHaveLength(0);

    // Verify that non-deleted chat still exists
    const nonDeletedChat = await MongoChat.findOne({
      appId,
      chatId: chatIds[2]
    });
    expect(nonDeletedChat).toBeDefined();
  });

  it('should delete single chat', async () => {
    const deleteIds = [chatIds[0]];

    const res = await Call<ChatBatchDeleteBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatIds: deleteIds
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that chat was deleted
    const deletedChat = await MongoChat.findOne({
      appId,
      chatId: chatIds[0]
    });
    expect(deletedChat).toBeNull();

    // Verify that other chats still exist
    const remainingChats = await MongoChat.find({
      appId,
      chatId: { $in: [chatIds[1], chatIds[2]] }
    });
    expect(remainingChats).toHaveLength(2);
  });

  it('should delete all chats when all chatIds are provided', async () => {
    const res = await Call<ChatBatchDeleteBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatIds
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that all chats were deleted
    const remainingChats = await MongoChat.find({
      appId,
      chatId: { $in: chatIds }
    });
    expect(remainingChats).toHaveLength(0);
  });

  it('should fail when chatIds is empty array', async () => {
    const res = await Call<ChatBatchDeleteBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatIds: []
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when chatIds is not an array', async () => {
    const res = await Call<any, {}, any>(handler, {
      auth: testUser,
      body: {
        appId,
        chatIds: 'not-an-array'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when appId is missing', async () => {
    const res = await Call<ChatBatchDeleteBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId: '',
        chatIds: [chatIds[0]]
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when user does not have permission', async () => {
    const unauthorizedUser = await getUser('unauthorized-user-batch-delete');

    const res = await Call<ChatBatchDeleteBodyType, {}>(handler, {
      auth: unauthorizedUser,
      body: {
        appId,
        chatIds: [chatIds[0]]
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should succeed even when some chatIds do not exist', async () => {
    const nonExistentChatId = getNanoid();
    const deleteIds = [chatIds[0], nonExistentChatId];

    const res = await Call<ChatBatchDeleteBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatIds: deleteIds
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that existing chat was deleted
    const deletedChat = await MongoChat.findOne({
      appId,
      chatId: chatIds[0]
    });
    expect(deletedChat).toBeNull();
  });

  it('should only delete chats belonging to the specified app', async () => {
    // Create another app with a chat
    const otherApp = await MongoApp.create({
      name: 'Other App',
      type: AppTypeEnum.simple,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      modules: []
    });
    const otherAppId = String(otherApp._id);
    const otherChatId = getNanoid();

    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId: otherAppId,
      chatId: otherChatId,
      source: ChatSourceEnum.test,
      title: 'Other App Chat'
    });

    // Try to delete a chat from the first app
    const res = await Call<ChatBatchDeleteBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatIds: [chatIds[0], otherChatId]
      }
    });

    expect(res.code).toBe(200);

    // Verify that only the chat from the specified app was deleted
    const deletedChat = await MongoChat.findOne({
      appId,
      chatId: chatIds[0]
    });
    expect(deletedChat).toBeNull();

    // Verify that the other app's chat still exists
    const otherChat = await MongoChat.findOne({
      appId: otherAppId,
      chatId: otherChatId
    });
    expect(otherChat).toBeDefined();
  });

  it('should handle large batch of chatIds', async () => {
    // Create 20 more chats
    const largeBatch = Array.from({ length: 20 }, () => getNanoid());

    await Promise.all(
      largeBatch.map((chatId) =>
        MongoChat.create({
          teamId: testUser.teamId,
          tmbId: testUser.tmbId,
          appId,
          chatId,
          source: ChatSourceEnum.test,
          title: `Test Chat ${chatId}`
        })
      )
    );

    const res = await Call<ChatBatchDeleteBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatIds: largeBatch
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that all chats were deleted
    const remainingChats = await MongoChat.find({
      appId,
      chatId: { $in: largeBatch }
    });
    expect(remainingChats).toHaveLength(0);
  });
});
