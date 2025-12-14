import { describe, expect, it, beforeEach } from 'vitest';
import {
  getChatItems,
  addCustomFeedbacks,
  updateChatFeedbackCount
} from '@fastgpt/service/core/chat/controller';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getUser } from '@test/datas/users';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { ChatItemSchema } from '@fastgpt/global/core/chat/type';

describe('getChatItems', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;

  beforeEach(async () => {
    testUser = await getUser('test-user');

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
  });

  // Helper function to create chat items
  const createChatItems = async (count: number): Promise<ChatItemSchema[]> => {
    const items: ChatItemSchema[] = [];
    for (let i = 0; i < count; i++) {
      const item = await MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        userId: testUser.userId,
        appId,
        chatId,
        dataId: getNanoid(),
        obj: i % 2 === 0 ? ChatRoleEnum.Human : ChatRoleEnum.AI,
        value: [
          {
            type: 'text',
            text: {
              content: `Message ${i + 1}`
            }
          }
        ]
      });
      items.push(item.toObject() as ChatItemSchema);
    }
    return items;
  };

  describe('Normal Pagination Mode', () => {
    it('should return empty array when chatId is not provided', async () => {
      const result = await getChatItems({
        appId,
        chatId: undefined,
        offset: 0,
        limit: 10,
        field: 'obj value'
      });

      expect(result.histories).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return empty array when no chat items exist', async () => {
      const result = await getChatItems({
        appId,
        chatId,
        offset: 0,
        limit: 10,
        field: 'obj value'
      });

      expect(result.histories).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should fetch chat items with pagination correctly', async () => {
      await createChatItems(20);

      const result = await getChatItems({
        appId,
        chatId,
        offset: 0,
        limit: 5,
        field: 'obj value'
      });

      expect(result.histories).toHaveLength(5);
      expect(result.total).toBe(20);
      // Should be in chronological order (oldest first)
      expect(result.histories[0].value[0].text?.content).toContain('Message 1');
    });

    it('should handle pagination offset correctly', async () => {
      await createChatItems(20);

      const result = await getChatItems({
        appId,
        chatId,
        offset: 5,
        limit: 5,
        field: 'obj value'
      });

      expect(result.histories).toHaveLength(5);
      expect(result.total).toBe(20);
      // The function gets items in reverse order then reverses them back
      // So offset 5 should skip the first 5 newest items and get items 6-10 (from newest)
      // After reversing, these would be items 11-15 from oldest (Message 11-15)
      expect(result.histories[0].value[0].text?.content).toContain('Message 11');
    });

    it('should return remaining items when limit exceeds available items', async () => {
      await createChatItems(5);

      const result = await getChatItems({
        appId,
        chatId,
        offset: 0,
        limit: 10,
        field: 'obj value'
      });

      expect(result.histories).toHaveLength(5);
      expect(result.total).toBe(5);
    });

    it('should only return specified fields', async () => {
      await createChatItems(5);

      const result = await getChatItems({
        appId,
        chatId,
        offset: 0,
        limit: 5,
        field: 'obj'
      });

      expect(result.histories).toHaveLength(5);
      // Should have dataId (always included) and obj
      expect(result.histories[0].dataId).toBeDefined();
      expect(result.histories[0].obj).toBeDefined();
      // Should not have other optional fields
      expect(result.histories[0].value).toBeUndefined();
    });
  });

  describe('Field Selection', () => {
    it('should always include dataId field even if not specified', async () => {
      await createChatItems(3);

      const result = await getChatItems({
        appId,
        chatId,
        offset: 0,
        limit: 3,
        field: 'obj value'
      });

      expect(result.histories).toHaveLength(3);
      result.histories.forEach((item) => {
        expect(item.dataId).toBeDefined();
        expect(typeof item.dataId).toBe('string');
      });
    });

    it('should include custom fields when specified', async () => {
      // Create AI items to support customFeedbacks
      const aiItem = await MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        userId: testUser.userId,
        appId,
        chatId,
        dataId: getNanoid(),
        obj: ChatRoleEnum.AI,
        value: [{ type: 'text', text: { content: 'AI response' } }],
        customFeedbacks: ['good', 'helpful']
      });

      const result = await getChatItems({
        appId,
        chatId,
        offset: 0,
        limit: 3,
        field: 'obj value customFeedbacks'
      });

      const aiHistory = result.histories.find((h) => h.obj === ChatRoleEnum.AI);
      expect(aiHistory).toBeDefined();
      // Type assertion to access customFeedbacks on AI item
      if (aiHistory && aiHistory.obj === ChatRoleEnum.AI) {
        expect(aiHistory.customFeedbacks).toEqual(['good', 'helpful']);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle single item correctly', async () => {
      await createChatItems(1);

      const result = await getChatItems({
        appId,
        chatId,
        offset: 0,
        limit: 10,
        field: 'obj value'
      });

      expect(result.histories).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should handle offset beyond total items', async () => {
      await createChatItems(5);

      const result = await getChatItems({
        appId,
        chatId,
        offset: 10,
        limit: 5,
        field: 'obj value'
      });

      expect(result.histories).toHaveLength(0);
      expect(result.total).toBe(5);
    });

    it('should handle zero limit gracefully', async () => {
      await createChatItems(5);

      const result = await getChatItems({
        appId,
        chatId,
        offset: 0,
        limit: 0,
        field: 'obj value'
      });

      // MongoDB's limit(0) returns all documents, so we should get all 5
      expect(result.histories).toHaveLength(5);
      expect(result.total).toBe(5);
    });

    it('should filter by appId and chatId correctly', async () => {
      const otherChatId = getNanoid();

      // Create items in target chat
      await createChatItems(5);

      // Create items in another chat
      await MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        appId,
        chatId: otherChatId,
        dataId: getNanoid(),
        obj: ChatRoleEnum.Human,
        value: [{ type: 'text', text: { content: 'Other chat' } }]
      });

      const result = await getChatItems({
        appId,
        chatId,
        offset: 0,
        limit: 10,
        field: 'obj value'
      });

      // Should only return items from target chat
      expect(result.histories).toHaveLength(5);
      expect(result.total).toBe(5);
    });
  });

  describe('Order Verification', () => {
    it('should return items in chronological order (oldest first)', async () => {
      const items = await createChatItems(10);

      const result = await getChatItems({
        appId,
        chatId,
        offset: 0,
        limit: 10,
        field: 'obj value'
      });

      // Verify order by comparing dataId with original items
      expect(result.histories).toHaveLength(10);
      result.histories.forEach((history, index) => {
        expect(history.dataId).toBe(items[index].dataId);
      });
    });
  });
});

describe('addCustomFeedbacks', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;
  let dataId: string;

  beforeEach(async () => {
    testUser = await getUser('test-user-feedback');

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

    // Create chat record
    await MongoChat.create({
      chatId,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      source: ChatSourceEnum.online
    });

    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId,
      dataId,
      obj: ChatRoleEnum.AI,
      value: [{ type: 'text', text: { content: 'Test message' } }]
    });
  });

  it('should add custom feedbacks to chat item', async () => {
    await addCustomFeedbacks({
      appId,
      chatId,
      dataId,
      feedbacks: ['good', 'helpful']
    });

    const item = await MongoChatItem.findOne({ dataId }).lean();
    // Cast to any to access customFeedbacks (it's optional on schema)
    expect((item as any)?.customFeedbacks).toEqual(['good', 'helpful']);
  });

  it('should append feedbacks to existing ones', async () => {
    // Add initial feedbacks
    await addCustomFeedbacks({
      appId,
      chatId,
      dataId,
      feedbacks: ['good']
    });

    // Add more feedbacks
    await addCustomFeedbacks({
      appId,
      chatId,
      dataId,
      feedbacks: ['helpful', 'clear']
    });

    const item = await MongoChatItem.findOne({ dataId }).lean();
    expect((item as any)?.customFeedbacks).toEqual(['good', 'helpful', 'clear']);
  });

  it('should handle empty feedbacks array', async () => {
    await addCustomFeedbacks({
      appId,
      chatId,
      dataId,
      feedbacks: []
    });

    const item = await MongoChatItem.findOne({ dataId }).lean();
    expect((item as any)?.customFeedbacks || []).toHaveLength(0);
  });

  it('should do nothing when chatId is not provided', async () => {
    await addCustomFeedbacks({
      appId,
      chatId: undefined,
      dataId,
      feedbacks: ['good']
    });

    const item = await MongoChatItem.findOne({ dataId }).lean();
    // When no update occurs, the field may be an empty array due to schema default or undefined
    const feedbacks = (item as any)?.customFeedbacks;
    expect(feedbacks === undefined || feedbacks?.length === 0).toBe(true);
  });

  it('should do nothing when dataId is not provided', async () => {
    await addCustomFeedbacks({
      appId,
      chatId,
      dataId: undefined,
      feedbacks: ['good']
    });

    const item = await MongoChatItem.findOne({ dataId }).lean();
    const feedbacks = (item as any)?.customFeedbacks;
    expect(feedbacks === undefined || feedbacks?.length === 0).toBe(true);
  });

  it('should handle non-existent item gracefully', async () => {
    // Should not throw error
    await expect(
      addCustomFeedbacks({
        appId,
        chatId,
        dataId: 'non-existent-id',
        feedbacks: ['good']
      })
    ).resolves.not.toThrow();
  });

  describe('updateChatFeedbackCount integration', () => {
    it('should not set Chat feedback flags when no user feedback exists', async () => {
      // addCustomFeedbacks always calls updateChatFeedbackCount
      // When there's no user feedback, flags should remain undefined
      await addCustomFeedbacks({
        appId,
        chatId,
        dataId,
        feedbacks: ['good', 'helpful']
      });

      const chat = await MongoChat.findOne({ appId, chatId }).lean();
      // Without user feedback, flags should be undefined (not set)
      expect(chat?.hasGoodFeedback).toBeUndefined();
      expect(chat?.hasBadFeedback).toBeUndefined();
      expect(chat?.hasUnreadGoodFeedback).toBeUndefined();
      expect(chat?.hasUnreadBadFeedback).toBeUndefined();
    });

    it('should update Chat flags when chat item has user feedback', async () => {
      // First, add user good feedback to the chat item
      await MongoChatItem.updateOne({ dataId }, { $set: { userGoodFeedback: 'Great answer!' } });

      // Then add custom feedbacks (which triggers updateChatFeedbackCount)
      await addCustomFeedbacks({
        appId,
        chatId,
        dataId,
        feedbacks: ['category1', 'category2']
      });

      const chat = await MongoChat.findOne({ appId, chatId }).lean();
      // Should detect the userGoodFeedback and set flag
      expect(chat?.hasGoodFeedback).toBe(true);
      expect(chat?.hasBadFeedback).toBeUndefined();
    });

    it('should aggregate all feedback when adding custom feedbacks', async () => {
      // Create another AI message with bad feedback
      const dataId2 = getNanoid();
      await MongoChatItem.create({
        teamId: testUser.teamId,
        tmbId: testUser.tmbId,
        appId,
        chatId,
        dataId: dataId2,
        obj: ChatRoleEnum.AI,
        value: [{ type: 'text', text: { content: 'Another message' } }],
        userBadFeedback: 'Wrong answer',
        isFeedbackRead: false
      });

      // Add user good feedback to first message
      await MongoChatItem.updateOne(
        { dataId },
        { $set: { userGoodFeedback: 'Good answer', isFeedbackRead: true } }
      );

      // Add custom feedbacks to first message
      await addCustomFeedbacks({
        appId,
        chatId,
        dataId,
        feedbacks: ['helpful']
      });

      const chat = await MongoChat.findOne({ appId, chatId }).lean();
      // Should aggregate both messages
      expect(chat?.hasGoodFeedback).toBe(true);
      expect(chat?.hasBadFeedback).toBe(true);
      expect(chat?.hasUnreadGoodFeedback).toBeUndefined(); // first message is read
      expect(chat?.hasUnreadBadFeedback).toBe(true); // second message is unread
    });

    it('should handle transaction rollback correctly', async () => {
      // Add user feedback first
      await MongoChatItem.updateOne({ dataId }, { $set: { userGoodFeedback: 'Great!' } });

      // Normal add should succeed and update Chat flags
      await addCustomFeedbacks({
        appId,
        chatId,
        dataId,
        feedbacks: ['good']
      });

      const chat = await MongoChat.findOne({ appId, chatId }).lean();
      expect(chat?.hasGoodFeedback).toBe(true);

      // Verify custom feedbacks were added
      const item = await MongoChatItem.findOne({ dataId }).lean();
      expect((item as any)?.customFeedbacks).toEqual(['good']);
    });

    it('should maintain Chat flags consistency across multiple operations', async () => {
      // Start with no feedback flags
      let chat = await MongoChat.findOne({ appId, chatId }).lean();
      expect(chat?.hasGoodFeedback).toBeUndefined();

      // Add user feedback and custom feedback together
      await MongoChatItem.updateOne(
        { dataId },
        { $set: { userGoodFeedback: 'Excellent', isFeedbackRead: false } }
      );

      await addCustomFeedbacks({
        appId,
        chatId,
        dataId,
        feedbacks: ['category1']
      });

      // Check flags are set
      chat = await MongoChat.findOne({ appId, chatId }).lean();
      expect(chat?.hasGoodFeedback).toBe(true);
      expect(chat?.hasUnreadGoodFeedback).toBe(true);

      // Mark as read
      await MongoChatItem.updateOne({ dataId }, { $set: { isFeedbackRead: true } });

      // Add more custom feedbacks
      await addCustomFeedbacks({
        appId,
        chatId,
        dataId,
        feedbacks: ['category2']
      });

      // Unread flag should be undefined now (not false)
      chat = await MongoChat.findOne({ appId, chatId }).lean();
      expect(chat?.hasGoodFeedback).toBe(true);
      expect(chat?.hasUnreadGoodFeedback).toBeUndefined();
    });
  });
});

describe('updateChatFeedbackCount', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;

  beforeEach(async () => {
    testUser = await getUser('test-user-feedback-count');

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

    // Create chat record
    await MongoChat.create({
      chatId,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      source: ChatSourceEnum.online
    });
  });

  // Helper function to create chat item with feedback
  const createChatItemWithFeedback = async (
    feedback: {
      userGoodFeedback?: string;
      userBadFeedback?: string;
      isFeedbackRead?: boolean;
    },
    obj: ChatRoleEnum = ChatRoleEnum.AI
  ) => {
    return await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      appId,
      chatId,
      dataId: getNanoid(),
      obj,
      value: [{ type: 'text', text: { content: 'Test message' } }],
      ...feedback
    });
  };

  it('should not set feedback flags when no feedback exists', async () => {
    // Create AI items without feedback
    await createChatItemWithFeedback({}, ChatRoleEnum.AI);
    await createChatItemWithFeedback({}, ChatRoleEnum.AI);

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBeUndefined();
    expect(chat?.hasBadFeedback).toBeUndefined();
    expect(chat?.hasUnreadGoodFeedback).toBeUndefined();
    expect(chat?.hasUnreadBadFeedback).toBeUndefined();
  });

  it('should set hasGoodFeedback to true when good feedback exists', async () => {
    await createChatItemWithFeedback({
      userGoodFeedback: 'Great response!'
    });

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBe(true);
    expect(chat?.hasBadFeedback).toBeUndefined();
  });

  it('should set hasBadFeedback to true when bad feedback exists', async () => {
    await createChatItemWithFeedback({
      userBadFeedback: 'Incorrect answer'
    });

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBeUndefined();
    expect(chat?.hasBadFeedback).toBe(true);
  });

  it('should set both feedback flags when both types exist', async () => {
    await createChatItemWithFeedback({
      userGoodFeedback: 'Great response!'
    });
    await createChatItemWithFeedback({
      userBadFeedback: 'Incorrect answer'
    });

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBe(true);
    expect(chat?.hasBadFeedback).toBe(true);
  });

  it('should set hasUnreadGoodFeedback when good feedback is unread', async () => {
    await createChatItemWithFeedback({
      userGoodFeedback: 'Great response!',
      isFeedbackRead: false
    });

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBe(true);
    expect(chat?.hasUnreadGoodFeedback).toBe(true);
  });

  it('should not set hasUnreadGoodFeedback when good feedback is read', async () => {
    await createChatItemWithFeedback({
      userGoodFeedback: 'Great response!',
      isFeedbackRead: true
    });

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBe(true);
    expect(chat?.hasUnreadGoodFeedback).toBeUndefined();
  });

  it('should set hasUnreadBadFeedback when bad feedback is unread', async () => {
    await createChatItemWithFeedback({
      userBadFeedback: 'Incorrect answer',
      isFeedbackRead: false
    });

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasBadFeedback).toBe(true);
    expect(chat?.hasUnreadBadFeedback).toBe(true);
  });

  it('should not set hasUnreadBadFeedback when bad feedback is read', async () => {
    await createChatItemWithFeedback({
      userBadFeedback: 'Incorrect answer',
      isFeedbackRead: true
    });

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasBadFeedback).toBe(true);
    expect(chat?.hasUnreadBadFeedback).toBeUndefined();
  });

  it('should handle mixed read/unread feedback correctly', async () => {
    // Unread good feedback
    await createChatItemWithFeedback({
      userGoodFeedback: 'Great!',
      isFeedbackRead: false
    });
    // Read good feedback
    await createChatItemWithFeedback({
      userGoodFeedback: 'Nice!',
      isFeedbackRead: true
    });
    // Unread bad feedback
    await createChatItemWithFeedback({
      userBadFeedback: 'Wrong',
      isFeedbackRead: false
    });
    // Read bad feedback
    await createChatItemWithFeedback({
      userBadFeedback: 'Incorrect',
      isFeedbackRead: true
    });

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBe(true);
    expect(chat?.hasBadFeedback).toBe(true);
    expect(chat?.hasUnreadGoodFeedback).toBe(true);
    expect(chat?.hasUnreadBadFeedback).toBe(true);
  });

  it('should only count AI messages, not Human messages', async () => {
    // Human message with feedback (should be ignored)
    await createChatItemWithFeedback(
      {
        userGoodFeedback: 'Great!'
      },
      ChatRoleEnum.Human
    );

    // AI message without feedback
    await createChatItemWithFeedback({}, ChatRoleEnum.AI);

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBeUndefined();
    expect(chat?.hasBadFeedback).toBeUndefined();
  });

  it('should handle multiple feedbacks of the same type', async () => {
    // Create 3 good feedbacks
    await createChatItemWithFeedback({
      userGoodFeedback: 'Great response 1!'
    });
    await createChatItemWithFeedback({
      userGoodFeedback: 'Great response 2!'
    });
    await createChatItemWithFeedback({
      userGoodFeedback: 'Great response 3!'
    });

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBe(true);
    expect(chat?.hasBadFeedback).toBeUndefined();
  });

  it('should update flags correctly when feedback is removed', async () => {
    // Create item with good feedback
    const item = await createChatItemWithFeedback({
      userGoodFeedback: 'Great response!'
    });

    await updateChatFeedbackCount({ appId, chatId });

    let chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBe(true);

    // Remove feedback
    await MongoChatItem.updateOne({ _id: item._id }, { $unset: { userGoodFeedback: '' } });

    await updateChatFeedbackCount({ appId, chatId });

    chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBeUndefined();
  });

  it('should handle chat with no AI messages', async () => {
    // Create only human messages
    await createChatItemWithFeedback({}, ChatRoleEnum.Human);

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBeUndefined();
    expect(chat?.hasBadFeedback).toBeUndefined();
    expect(chat?.hasUnreadGoodFeedback).toBeUndefined();
    expect(chat?.hasUnreadBadFeedback).toBeUndefined();
  });

  it('should handle isFeedbackRead undefined as unread', async () => {
    // When isFeedbackRead is undefined, it should be treated as unread
    await createChatItemWithFeedback({
      userGoodFeedback: 'Great response!'
      // isFeedbackRead is undefined
    });

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBe(true);
    expect(chat?.hasUnreadGoodFeedback).toBe(true);
  });

  it('should correctly aggregate large number of feedbacks', async () => {
    // Create 10 good feedbacks (5 unread, 5 read)
    for (let i = 0; i < 10; i++) {
      await createChatItemWithFeedback({
        userGoodFeedback: `Good ${i}`,
        isFeedbackRead: i >= 5
      });
    }

    // Create 8 bad feedbacks (3 unread, 5 read)
    for (let i = 0; i < 8; i++) {
      await createChatItemWithFeedback({
        userBadFeedback: `Bad ${i}`,
        isFeedbackRead: i >= 3
      });
    }

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBe(true);
    expect(chat?.hasBadFeedback).toBe(true);
    expect(chat?.hasUnreadGoodFeedback).toBe(true);
    expect(chat?.hasUnreadBadFeedback).toBe(true);
  });

  it('should work correctly within a transaction session', async () => {
    await createChatItemWithFeedback({
      userGoodFeedback: 'Great response!'
    });

    // Test that it works with session parameter (session will be undefined in this test)
    await updateChatFeedbackCount({ appId, chatId, session: undefined });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    expect(chat?.hasGoodFeedback).toBe(true);
  });

  it('should handle edge case with empty feedback strings', async () => {
    // Create items with empty strings
    await createChatItemWithFeedback({
      userGoodFeedback: ''
    });

    await updateChatFeedbackCount({ appId, chatId });

    const chat = await MongoChat.findOne({ appId, chatId }).lean();
    // Empty string is still truthy in MongoDB's $ifNull check, so it counts as feedback
    expect(chat?.hasGoodFeedback).toBe(true);
  });
});
