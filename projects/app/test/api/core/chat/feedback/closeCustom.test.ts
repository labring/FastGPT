import handler from '@/pages/api/core/chat/feedback/closeCustom';
import {
  type CloseCustomFeedbackBodyType,
  type CloseCustomFeedbackResponseType
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

describe('closeCustom api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;
  let dataId: string;

  beforeEach(async () => {
    testUser = await getUser(`test-user-close-custom-${Math.random()}`);

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

    // Create chat item with custom feedbacks
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
      customFeedbacks: ['feedback1', 'feedback2', 'feedback3']
    });
  });

  it('should close custom feedback successfully', async () => {
    const res = await Call<CloseCustomFeedbackBodyType, {}, CloseCustomFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId,
          index: 1
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that custom feedback at index 1 was removed
    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.customFeedbacks).toHaveLength(2);
    expect(updatedChatItem?.customFeedbacks?.[0]).toBe('feedback1');
    expect(updatedChatItem?.customFeedbacks?.[1]).toBe('feedback3');
  });

  it('should fail when user does not have permission', async () => {
    const unauthorizedUser = await getUser(`unauthorized-user-close-${Math.random()}`);

    const res = await Call<CloseCustomFeedbackBodyType, {}, CloseCustomFeedbackResponseType>(
      handler,
      {
        auth: unauthorizedUser,
        body: {
          appId,
          chatId,
          dataId,
          index: 0
        }
      }
    );

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should handle closing first feedback', async () => {
    const res = await Call<CloseCustomFeedbackBodyType, {}, CloseCustomFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId,
          index: 0
        }
      }
    );

    expect(res.code).toBe(200);

    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.customFeedbacks).toHaveLength(2);
    expect(updatedChatItem?.customFeedbacks?.[0]).toBe('feedback2');
  });

  it('should handle closing last feedback', async () => {
    const res = await Call<CloseCustomFeedbackBodyType, {}, CloseCustomFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId,
          index: 2
        }
      }
    );

    expect(res.code).toBe(200);

    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.customFeedbacks).toHaveLength(2);
    expect(updatedChatItem?.customFeedbacks?.[1]).toBe('feedback2');
  });
});
