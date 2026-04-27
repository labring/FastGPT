import handler from '@/pages/api/core/chat/history/updateHistory';
import type { UpdateHistoryBodyType } from '@fastgpt/global/openapi/core/chat/history/api';
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

describe('updateHistory api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;

  beforeEach(async () => {
    testUser = await getUser('test-user-update-history');

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
      source: ChatSourceEnum.test,
      title: 'Original Title'
    });
  });

  it('should update chat title successfully', async () => {
    const newTitle = 'Updated Title';

    const res = await Call<UpdateHistoryBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        title: newTitle
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that chat title was updated
    const updatedChat = await MongoChat.findOne({
      appId,
      chatId
    });

    expect(updatedChat?.title).toBe(newTitle);
  });

  it('should update customTitle successfully', async () => {
    const customTitle = 'Custom Title';

    const res = await Call<UpdateHistoryBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        customTitle
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that customTitle was updated
    const updatedChat = await MongoChat.findOne({
      appId,
      chatId
    });

    expect(updatedChat?.customTitle).toBe(customTitle);
  });

  it('should update top status successfully', async () => {
    const res = await Call<UpdateHistoryBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        top: true
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that top was updated
    const updatedChat = await MongoChat.findOne({
      appId,
      chatId
    });

    expect(updatedChat?.top).toBe(true);
  });

  it('should update multiple fields at once', async () => {
    const newTitle = 'New Title';
    const customTitle = 'New Custom Title';
    const top = true;

    const res = await Call<UpdateHistoryBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        title: newTitle,
        customTitle,
        top
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that all fields were updated
    const updatedChat = await MongoChat.findOne({
      appId,
      chatId
    });

    expect(updatedChat?.title).toBe(newTitle);
    expect(updatedChat?.customTitle).toBe(customTitle);
    expect(updatedChat?.top).toBe(top);
  });

  it('should update updateTime when updating', async () => {
    const originalChat = await MongoChat.findOne({ appId, chatId });
    const originalUpdateTime = originalChat?.updateTime;

    // Wait a bit to ensure time difference
    await new Promise((resolve) => setTimeout(resolve, 10));

    const res = await Call<UpdateHistoryBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        title: 'New Title'
      }
    });

    expect(res.code).toBe(200);

    const updatedChat = await MongoChat.findOne({ appId, chatId });
    expect(updatedChat?.updateTime.getTime()).toBeGreaterThan(originalUpdateTime?.getTime() || 0);
  });

  it('should fail when chatId is missing', async () => {
    const res = await Call<UpdateHistoryBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId: '',
        title: 'New Title'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when appId is missing', async () => {
    const res = await Call<UpdateHistoryBodyType, {}>(handler, {
      auth: testUser,
      body: {
        appId: '',
        chatId,
        title: 'New Title'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when user does not have permission', async () => {
    const unauthorizedUser = await getUser('unauthorized-user-update-history');

    const res = await Call<UpdateHistoryBodyType, {}>(handler, {
      auth: unauthorizedUser,
      body: {
        appId,
        chatId,
        title: 'New Title'
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });
});
