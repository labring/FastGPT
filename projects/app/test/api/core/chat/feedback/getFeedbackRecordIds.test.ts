import handler from '@/pages/api/core/chat/feedback/getFeedbackRecordIds';
import {
  type GetFeedbackRecordIdsBodyType,
  type GetFeedbackRecordIdsResponseType
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

describe('getFeedbackRecordIds api test', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;

  beforeEach(async () => {
    testUser = await getUser(`test-user-get-feedback-ids-${Math.random()}`);

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

    // Create chat
    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId,
      source: ChatSourceEnum.test
    });

    // Create chat items with different feedback types
    // Item 1: Good feedback, read
    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      appId,
      chatId,
      dataId: 'data-1',
      obj: ChatRoleEnum.AI,
      value: [{ type: 'text', text: { content: 'Response 1' } }],
      userGoodFeedback: 'Great answer!',
      isFeedbackRead: true
    });

    // Item 2: Good feedback, unread
    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      appId,
      chatId,
      dataId: 'data-2',
      obj: ChatRoleEnum.AI,
      value: [{ type: 'text', text: { content: 'Response 2' } }],
      userGoodFeedback: 'Excellent!',
      isFeedbackRead: false
    });

    // Item 3: Bad feedback, read
    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      appId,
      chatId,
      dataId: 'data-3',
      obj: ChatRoleEnum.AI,
      value: [{ type: 'text', text: { content: 'Response 3' } }],
      userBadFeedback: 'Not helpful',
      isFeedbackRead: true
    });

    // Item 4: Bad feedback, unread
    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      appId,
      chatId,
      dataId: 'data-4',
      obj: ChatRoleEnum.AI,
      value: [{ type: 'text', text: { content: 'Response 4' } }],
      userBadFeedback: 'Incorrect answer',
      isFeedbackRead: false
    });

    // Item 5: No feedback
    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      appId,
      chatId,
      dataId: 'data-5',
      obj: ChatRoleEnum.AI,
      value: [{ type: 'text', text: { content: 'Response 5' } }]
    });

    // Item 6: Human message (should not be included)
    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      appId,
      chatId,
      dataId: 'data-6',
      obj: ChatRoleEnum.Human,
      value: [{ type: 'text', text: { content: 'Question' } }],
      userGoodFeedback: 'Good question'
    });
  });

  it('should return all good feedback records', async () => {
    const res = await Call<GetFeedbackRecordIdsBodyType, {}, GetFeedbackRecordIdsResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          feedbackType: 'good',
          unreadOnly: false
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data?.total).toBe(2);
    expect(res.data?.dataIds).toHaveLength(2);
    expect(res.data?.dataIds).toContain('data-1');
    expect(res.data?.dataIds).toContain('data-2');
  });

  it('should return only unread good feedback records', async () => {
    const res = await Call<GetFeedbackRecordIdsBodyType, {}, GetFeedbackRecordIdsResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          feedbackType: 'good',
          unreadOnly: true
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data?.total).toBe(1);
    expect(res.data?.dataIds).toHaveLength(1);
    expect(res.data?.dataIds).toContain('data-2');
  });

  it('should return all bad feedback records', async () => {
    const res = await Call<GetFeedbackRecordIdsBodyType, {}, GetFeedbackRecordIdsResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          feedbackType: 'bad',
          unreadOnly: false
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data?.total).toBe(2);
    expect(res.data?.dataIds).toHaveLength(2);
    expect(res.data?.dataIds).toContain('data-3');
    expect(res.data?.dataIds).toContain('data-4');
  });

  it('should return only unread bad feedback records', async () => {
    const res = await Call<GetFeedbackRecordIdsBodyType, {}, GetFeedbackRecordIdsResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          feedbackType: 'bad',
          unreadOnly: true
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data?.total).toBe(1);
    expect(res.data?.dataIds).toHaveLength(1);
    expect(res.data?.dataIds).toContain('data-4');
  });

  it('should return all feedback records with has_feedback type', async () => {
    const res = await Call<GetFeedbackRecordIdsBodyType, {}, GetFeedbackRecordIdsResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          feedbackType: 'has_feedback',
          unreadOnly: false
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data?.total).toBe(4);
    expect(res.data?.dataIds).toHaveLength(4);
    expect(res.data?.dataIds).toContain('data-1');
    expect(res.data?.dataIds).toContain('data-2');
    expect(res.data?.dataIds).toContain('data-3');
    expect(res.data?.dataIds).toContain('data-4');
  });

  it('should return only unread feedback records with has_feedback type', async () => {
    const res = await Call<GetFeedbackRecordIdsBodyType, {}, GetFeedbackRecordIdsResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId,
          chatId,
          feedbackType: 'has_feedback',
          unreadOnly: true
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data?.total).toBe(2);
    expect(res.data?.dataIds).toHaveLength(2);
    expect(res.data?.dataIds).toContain('data-2');
    expect(res.data?.dataIds).toContain('data-4');
  });

  it('should return empty result when no appId or chatId', async () => {
    const res = await Call<GetFeedbackRecordIdsBodyType, {}, GetFeedbackRecordIdsResponseType>(
      handler,
      {
        auth: testUser,
        body: {
          appId: '',
          chatId: '',
          feedbackType: 'good',
          unreadOnly: false
        }
      }
    );

    expect(res.code).toBe(200);
    expect(res.data?.total).toBe(0);
    expect(res.data?.dataIds).toHaveLength(0);
  });

  it('should fail when user does not have permission', async () => {
    const unauthorizedUser = await getUser(`unauthorized-user-get-ids-${Math.random()}`);

    const res = await Call<GetFeedbackRecordIdsBodyType, {}, GetFeedbackRecordIdsResponseType>(
      handler,
      {
        auth: unauthorizedUser,
        body: {
          appId,
          chatId,
          feedbackType: 'good',
          unreadOnly: false
        }
      }
    );

    expect(res.code).toBe(500);
    expect(res.error).toBeDefined();
  });
});
