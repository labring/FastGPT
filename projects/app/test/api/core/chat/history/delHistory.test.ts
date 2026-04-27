import handler from '@/pages/api/core/chat/history/delHistory';
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

describe('delHistory api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;

  beforeEach(async () => {
    testUser = await getUser('test-user-del-history');

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

    chatId = getNanoid();

    // Create chat
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId,
      source: ChatSourceEnum.test
    });
  });

  it('should soft delete chat history successfully', async () => {
    // Verify chat exists before deletion
    const chatBefore = await MongoChat.findOne(
      {
        appId,
        chatId
      },
      {
        deleteTime: 1
      }
    ).lean();
    expect(chatBefore).toBeDefined();
    expect(chatBefore?.deleteTime).toBeNull();

    const res = await Call<any, { appId: string; chatId: string }, any>(handler, {
      auth: testUser,
      query: {
        appId,
        chatId
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that chat was soft deleted (deleteTime is set)
    const deletedChat = await MongoChat.findOne(
      {
        appId,
        chatId
      },
      { deleteTime: 1 }
    ).lean();

    expect(deletedChat).toBeDefined();
    expect(deletedChat?.deleteTime).not.toBeNull();
  });

  it('should fail when chatId is missing', async () => {
    const res = await Call<any, { appId: string; chatId?: string }, any>(handler, {
      auth: testUser,
      query: {
        appId
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when appId is missing', async () => {
    const res = await Call<any, { appId?: string; chatId: string }, any>(handler, {
      auth: testUser,
      query: {
        chatId
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when user does not have permission', async () => {
    const unauthorizedUser = await getUser('unauthorized-user-del-history');

    const res = await Call<any, { appId: string; chatId: string }, any>(handler, {
      auth: unauthorizedUser,
      query: {
        appId,
        chatId
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should succeed even if chat does not exist', async () => {
    const nonExistentChatId = getNanoid();

    const res = await Call<any, { appId: string; chatId: string }, any>(handler, {
      auth: testUser,
      query: {
        appId,
        chatId: nonExistentChatId
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();
  });
});
