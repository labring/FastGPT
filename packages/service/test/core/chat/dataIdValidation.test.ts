import { beforeEach, describe, expect, it } from 'vitest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import {
  CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE,
  assertNoDuplicateChatDataIdsInRequest,
  getChatMessagesDataIds,
  validateChatRoundDataIds
} from '@fastgpt/service/core/chat/dataIdValidation';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getUser } from '@test/datas/users';

describe('chat dataId validation', () => {
  let testUser: Awaited<ReturnType<typeof getUser>>;
  let appId: string;
  let chatId: string;

  beforeEach(async () => {
    testUser = await getUser('test-user');
    chatId = getNanoid(24);

    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      modules: []
    });
    appId = String(app._id);
  });

  it('should collect only valid dataIds from chat messages', () => {
    expect(
      getChatMessagesDataIds([
        {
          obj: ChatRoleEnum.Human,
          dataId: 'human-1',
          value: [{ text: { content: 'hello' } }]
        },
        {
          obj: ChatRoleEnum.AI,
          value: [{ text: { content: 'hi' } }]
        },
        {
          obj: ChatRoleEnum.Human,
          dataId: '',
          value: [{ text: { content: 'next' } }]
        }
      ])
    ).toEqual(['human-1']);
  });

  it('should reject duplicate dataIds in the current request', () => {
    expect(() =>
      assertNoDuplicateChatDataIdsInRequest(['history-1', undefined, 'history-1'])
    ).toThrow(`${CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE}: history-1`);
  });

  it('should reject human and ai sharing one dataId', async () => {
    await expect(
      validateChatRoundDataIds({
        appId,
        chatId,
        userContent: {
          obj: ChatRoleEnum.Human,
          dataId: 'same-data-id',
          value: [{ text: { content: 'hello' } }]
        },
        responseChatItemId: 'same-data-id'
      })
    ).rejects.toThrow(`${CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE}: same-data-id`);
  });

  it('should reject dataIds that already exist in chat items', async () => {
    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId,
      dataId: 'existing-ai',
      obj: ChatRoleEnum.AI,
      value: [{ text: { content: 'old answer' } }]
    });

    await expect(
      validateChatRoundDataIds({
        appId,
        chatId,
        userContent: {
          obj: ChatRoleEnum.Human,
          dataId: 'new-human',
          value: [{ text: { content: 'hello' } }]
        },
        responseChatItemId: 'existing-ai'
      })
    ).rejects.toThrow(`${CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE}: existing-ai`);
  });

  it('should allow unique current round dataIds', async () => {
    await expect(
      validateChatRoundDataIds({
        appId,
        chatId,
        userContent: {
          obj: ChatRoleEnum.Human,
          dataId: 'new-human',
          value: [{ text: { content: 'hello' } }]
        },
        responseChatItemId: 'new-ai'
      })
    ).resolves.toBeUndefined();
  });
});
