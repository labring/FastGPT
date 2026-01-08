import handler from '@/pages/api/core/chat/feedback/updateUserFeedback';
import {
  type UpdateUserFeedbackBodyType,
  type UpdateUserFeedbackResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoAppChatLog } from '@fastgpt/service/core/app/logs/chatLogsSchema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { describe, expect, it, beforeEach } from 'vitest';

describe('updateUserFeedback api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;
  let dataId: string;

  beforeEach(async () => {
    testUser = await getUser(`test-user-update-feedback-${Math.random()}`);

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

    // Create chat log
    await MongoAppChatLog.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId,
      userId: String(testUser.userId),
      source: ChatSourceEnum.test,
      createTime: new Date(),
      updateTime: new Date(),
      goodFeedbackCount: 0,
      badFeedbackCount: 0
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

  it('should add good feedback', async () => {
    const res = await Call<UpdateUserFeedbackBodyType, {}, UpdateUserFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId,
          userGoodFeedback: 'Great answer!'
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that good feedback was added
    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.userGoodFeedback).toBe('Great answer!');

    // Verify chat log was updated
    const chatLog = await MongoAppChatLog.findOne({
      teamId: testUser.teamId,
      appId,
      chatId
    });

    expect(chatLog?.goodFeedbackCount).toBe(1);
    expect(chatLog?.badFeedbackCount).toBe(0);
  });

  it('should add bad feedback', async () => {
    const res = await Call<UpdateUserFeedbackBodyType, {}, UpdateUserFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId,
          userBadFeedback: 'Not helpful'
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that bad feedback was added
    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.userBadFeedback).toBe('Not helpful');

    // Verify chat log was updated
    const chatLog = await MongoAppChatLog.findOne({
      teamId: testUser.teamId,
      appId,
      chatId
    });

    expect(chatLog?.goodFeedbackCount).toBe(0);
    expect(chatLog?.badFeedbackCount).toBe(1);
  });

  it('should remove good feedback', async () => {
    // First add good feedback
    await MongoChatItem.updateOne({ appId, chatId, dataId }, { userGoodFeedback: 'Great!' });
    await MongoAppChatLog.updateOne(
      { teamId: testUser.teamId, appId, chatId },
      { goodFeedbackCount: 1 }
    );

    const res = await Call<UpdateUserFeedbackBodyType, {}, UpdateUserFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId,
          userGoodFeedback: undefined
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that good feedback was removed
    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.userGoodFeedback).toBeUndefined();

    // Verify chat log was updated
    const chatLog = await MongoAppChatLog.findOne({
      teamId: testUser.teamId,
      appId,
      chatId
    });

    expect(chatLog?.goodFeedbackCount).toBe(0);
  });

  it('should remove bad feedback', async () => {
    // First add bad feedback
    await MongoChatItem.updateOne({ appId, chatId, dataId }, { userBadFeedback: 'Not helpful' });
    await MongoAppChatLog.updateOne(
      { teamId: testUser.teamId, appId, chatId },
      { badFeedbackCount: 1 }
    );

    const res = await Call<UpdateUserFeedbackBodyType, {}, UpdateUserFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId,
          userBadFeedback: undefined
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that bad feedback was removed
    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.userBadFeedback).toBeUndefined();

    // Verify chat log was updated
    const chatLog = await MongoAppChatLog.findOne({
      teamId: testUser.teamId,
      appId,
      chatId
    });

    expect(chatLog?.badFeedbackCount).toBe(0);
  });

  it('should update good feedback', async () => {
    // First add good feedback
    await MongoChatItem.updateOne({ appId, chatId, dataId }, { userGoodFeedback: 'Good' });
    await MongoAppChatLog.updateOne(
      { teamId: testUser.teamId, appId, chatId },
      { goodFeedbackCount: 1 }
    );

    const res = await Call<UpdateUserFeedbackBodyType, {}, UpdateUserFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId,
          userGoodFeedback: 'Excellent!'
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify that good feedback was updated
    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.userGoodFeedback).toBe('Excellent!');

    // Verify chat log count remains the same
    const chatLog = await MongoAppChatLog.findOne({
      teamId: testUser.teamId,
      appId,
      chatId
    });

    expect(chatLog?.goodFeedbackCount).toBe(1);
  });

  it('should switch from good to bad feedback', async () => {
    // First add good feedback
    await MongoChatItem.updateOne({ appId, chatId, dataId }, { userGoodFeedback: 'Good' });
    await MongoAppChatLog.updateOne(
      { teamId: testUser.teamId, appId, chatId },
      { goodFeedbackCount: 1 }
    );

    // Remove good and add bad feedback
    const res = await Call<UpdateUserFeedbackBodyType, {}, UpdateUserFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId,
          userGoodFeedback: undefined,
          userBadFeedback: 'Actually not good'
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    // Verify feedbacks were updated
    const updatedChatItem = await MongoChatItem.findOne({
      appId,
      chatId,
      dataId
    });

    expect(updatedChatItem?.userGoodFeedback).toBeUndefined();
    expect(updatedChatItem?.userBadFeedback).toBe('Actually not good');

    // Verify chat log was updated
    const chatLog = await MongoAppChatLog.findOne({
      teamId: testUser.teamId,
      appId,
      chatId
    });

    expect(chatLog?.goodFeedbackCount).toBe(0);
    expect(chatLog?.badFeedbackCount).toBe(1);
  });

  it('should fail when chatId is empty', async () => {
    const res = await Call<UpdateUserFeedbackBodyType, {}, UpdateUserFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId: '',
          dataId,
          userGoodFeedback: 'Great!'
        }
      }
    );

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when dataId is empty', async () => {
    const res = await Call<UpdateUserFeedbackBodyType, {}, UpdateUserFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId: '',
          userGoodFeedback: 'Great!'
        }
      }
    );

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when chat item does not exist', async () => {
    const res = await Call<UpdateUserFeedbackBodyType, {}, UpdateUserFeedbackResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          dataId: 'non-existent-id',
          userGoodFeedback: 'Great!'
        }
      }
    );

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });

  it('should fail when user does not have permission', async () => {
    const unauthorizedUser = await getUser(`unauthorized-user-feedback-${Math.random()}`);

    const res = await Call<UpdateUserFeedbackBodyType, {}, UpdateUserFeedbackResponseType>(
      handler,
      {
        auth: unauthorizedUser,
        body: {
          appId,
          chatId,
          dataId,
          userGoodFeedback: 'Great!'
        }
      }
    );

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });
});
