import handler from '@/pages/api/core/chat/feedback/updateFeedbackReadStatus';
import {
  type UpdateFeedbackReadStatusBodyType,
  type UpdateFeedbackReadStatusResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, beforeEach } from 'vitest';

describe('updateFeedbackReadStatus api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;
  let dataId: string;

  beforeEach(async () => {
    // Use unique username for each test to avoid concurrency issues
    testUser = await getUser(`test-user-update-read-status-${Math.random()}`);

    // Create test app
    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      modules: []
    });
    appId = String(app._id);
    chatId = getNanoid();
    dataId = getNanoid();

    // Create chat
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId,
      source: ChatSourceEnum.test
    });

    // Create chat item with feedback
    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      appId,
      chatId,
      dataId,
      obj: ChatRoleEnum.AI,
      value: [
        {
          type: 'text',
          text: {
            content: 'Test response'
          }
        }
      ],
      userGoodFeedback: 'Great answer!',
      isFeedbackRead: false
    });
  });

  it('should mark feedback as read', async () => {
    const res = await Call<
      UpdateFeedbackReadStatusBodyType,
      {},
      UpdateFeedbackReadStatusResponseType
    >(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        dataId,
        isRead: true
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();
    expect(res.data?.success).toBe(true);

    // Verify that feedback was marked as read
    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.isFeedbackRead).toBe(true);
  });

  it('should mark feedback as unread', async () => {
    // First mark as read
    await MongoChatItem.updateOne({ appId, chatId, dataId }, { isFeedbackRead: true });

    const res = await Call<
      UpdateFeedbackReadStatusBodyType,
      {},
      UpdateFeedbackReadStatusResponseType
    >(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        dataId,
        isRead: false
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();
    expect(res.data?.success).toBe(true);

    // Verify that feedback was marked as unread
    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.isFeedbackRead).toBe(false);
  });

  it('should fail when user does not have permission', async () => {
    const unauthorizedUser = await getUser(`unauthorized-user-read-status-${Math.random()}`);

    const res = await Call<
      UpdateFeedbackReadStatusBodyType,
      {},
      UpdateFeedbackReadStatusResponseType
    >(handler, {
      auth: unauthorizedUser,
      body: {
        appId,
        chatId,
        dataId,
        isRead: true
      }
    });

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should only update AI role chat items', async () => {
    const humanDataId = getNanoid();

    // Create a human message
    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      appId,
      chatId,
      dataId: humanDataId,
      obj: ChatRoleEnum.Human,
      value: [
        {
          type: 'text',
          text: {
            content: 'Test question'
          }
        }
      ],
      isFeedbackRead: false
    });

    const res = await Call<
      UpdateFeedbackReadStatusBodyType,
      {},
      UpdateFeedbackReadStatusResponseType
    >(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        dataId: humanDataId,
        isRead: true
      }
    });

    expect(res.code).toBe(200);

    // Verify that human message was not updated (obj filter should prevent it)
    const humanChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId: humanDataId
    });

    expect(humanChatItem?.isFeedbackRead).toBe(false);
  });

  it('should handle non-existent dataId gracefully', async () => {
    const res = await Call<
      UpdateFeedbackReadStatusBodyType,
      {},
      UpdateFeedbackReadStatusResponseType
    >(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        dataId: 'non-existent-id',
        isRead: true
      }
    });

    expect(res.code).toBe(200);
    expect(res.data?.success).toBe(true);
  });
});
