import handler from '@/pages/api/core/chat/feedback/adminUpdate';
import {
  type AdminUpdateFeedbackBodyType,
  type AdminUpdateFeedbackResponseType
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

describe('adminUpdate api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;
  let dataId: string;

  beforeEach(async () => {
    testUser = await getUser('test-user-admin-feedback');

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

    // Create chat item
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
      ]
    });
  });

  it('should update admin feedback successfully', async () => {
    const datasetId = getNanoid();
    const feedbackDataId = getNanoid();
    const q = 'What is AI?';
    const a = 'AI stands for Artificial Intelligence';

    const res = await Call<AdminUpdateFeedbackBodyType, {}, AdminUpdateFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId,
          datasetId,
          feedbackDataId,
          q,
          a
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that adminFeedback was updated
    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.adminFeedback).toBeDefined();
    expect(updatedChatItem?.adminFeedback?.datasetId).toBe(datasetId);
    expect(updatedChatItem?.adminFeedback?.dataId).toBe(feedbackDataId);
    expect(updatedChatItem?.adminFeedback?.q).toBe(q);
    expect(updatedChatItem?.adminFeedback?.a).toBe(a);
  });

  it('should fail when user does not have permission', async () => {
    const unauthorizedUser = await getUser('unauthorized-user-admin');

    const res = await Call<AdminUpdateFeedbackBodyType, {}, AdminUpdateFeedbackResponseType>(
      handler,
      {
        auth: unauthorizedUser,
        body: {
          appId,
          chatId,
          dataId,
          datasetId: getNanoid(),
          feedbackDataId: getNanoid(),
          q: 'test',
          a: 'test'
        }
      }
    );

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });
});
