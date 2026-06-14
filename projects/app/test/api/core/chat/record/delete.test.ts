import handler from '@/pages/api/core/chat/record/delete';
import type { DeleteChatRecordBodyType } from '@fastgpt/global/openapi/core/chat/record/api';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { ChatRoleEnum, ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { getUser } from '@test/datas/users';
import { Call } from '@test/utils/request';
import { beforeEach, describe, expect, it } from 'vitest';

describe('delete chat record api', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;

  const createChatItem = async (dataId: string) =>
    MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      userId: testUser.userId,
      appId,
      chatId,
      dataId,
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: `Response ${dataId}`
          }
        }
      ]
    });

  beforeEach(async () => {
    testUser = await getUser(`test-user-delete-chat-record-${Math.random()}`);

    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      modules: []
    });
    appId = String(app._id);
    chatId = getNanoid();

    await MongoChat.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId,
      source: ChatSourceEnum.test
    });
  });

  it('should soft delete body contentIds and de-duplicate repeated ids', async () => {
    await Promise.all([
      createChatItem('delete-1'),
      createChatItem('delete-2'),
      createChatItem('keep-1')
    ]);

    const res = await Call<DeleteChatRecordBodyType, Record<string, never>>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        contentIds: ['delete-1', 'delete-1', 'delete-2']
      }
    });

    expect(res.code).toBe(200);
    expect(res.error).toBeUndefined();

    const deletedItems = await MongoChatItem.find({
      appId,
      chatId,
      dataId: { $in: ['delete-1', 'delete-2'] }
    }).lean();
    expect(deletedItems).toHaveLength(2);
    deletedItems.forEach((item) => {
      expect(item.deleteTime).toBeInstanceOf(Date);
    });

    const keptItem = await MongoChatItem.findOne({ appId, chatId, dataId: 'keep-1' }).lean();
    expect(keptItem?.deleteTime).toBeNull();
  });

  it('should prefer body payload over query payload', async () => {
    await Promise.all([createChatItem('body-id'), createChatItem('query-id')]);

    const res = await Call<DeleteChatRecordBodyType, DeleteChatRecordBodyType>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId,
        contentId: 'body-id'
      },
      query: {
        appId,
        chatId,
        contentId: 'query-id'
      }
    });

    expect(res.code).toBe(200);

    const bodyItem = await MongoChatItem.findOne({ appId, chatId, dataId: 'body-id' }).lean();
    const queryItem = await MongoChatItem.findOne({ appId, chatId, dataId: 'query-id' }).lean();
    expect(bodyItem?.deleteTime).toBeInstanceOf(Date);
    expect(queryItem?.deleteTime).toBeNull();
  });

  it('should keep compatibility with query contentId and comma separated contentIds', async () => {
    await Promise.all([
      createChatItem('legacy-single'),
      createChatItem('legacy-list-1'),
      createChatItem('legacy-list-2')
    ]);

    const res = await Call<Record<string, never>, DeleteChatRecordBodyType>(handler, {
      auth: testUser,
      query: {
        appId,
        chatId,
        contentId: 'legacy-single',
        contentIds: 'legacy-list-1, legacy-list-2'
      } as any
    });

    expect(res.code).toBe(200);

    const deletedCount = await MongoChatItem.countDocuments({
      appId,
      chatId,
      dataId: { $in: ['legacy-single', 'legacy-list-1', 'legacy-list-2'] },
      deleteTime: { $ne: null }
    });
    expect(deletedCount).toBe(3);
  });

  it('should authorize but skip update when no content id is provided', async () => {
    await createChatItem('keep-empty-target');

    const res = await Call<DeleteChatRecordBodyType, Record<string, never>>(handler, {
      auth: testUser,
      body: {
        appId,
        chatId
      }
    });

    expect(res.code).toBe(200);

    const item = await MongoChatItem.findOne({ appId, chatId, dataId: 'keep-empty-target' }).lean();
    expect(item?.deleteTime).toBeNull();
  });
});
