import { beforeEach, describe, expect, it } from 'vitest';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import {
  CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE,
  assertNoExistingChatDataIds,
  assertNoDuplicateChatDataIdsInRequest,
  getChatMessagesDataIds,
  validateChatRoundDataIds
} from '@fastgpt/service/core/chat/utils/dataIdValidation';
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

  it('should ignore empty values when checking duplicate dataIds in the current request', () => {
    expect(() => assertNoDuplicateChatDataIdsInRequest([undefined, '', 'history-1'])).not.toThrow();
  });

  it('should allow human and ai sharing one round dataId', async () => {
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
    ).resolves.toBeUndefined();
  });

  it('should allow current round AI dataId when only an existing human item has the same dataId', async () => {
    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId,
      dataId: 'same-round-id',
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'old question' } }]
    });

    await expect(
      validateChatRoundDataIds({
        appId,
        chatId,
        userContent: {
          obj: ChatRoleEnum.Human,
          dataId: 'same-round-id',
          value: [{ text: { content: 'hello' } }]
        },
        responseChatItemId: 'same-round-id'
      })
    ).resolves.toBeUndefined();
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

  it('should skip current round AI dataId validation when responseChatItemId is missing', async () => {
    await expect(
      validateChatRoundDataIds({
        appId,
        chatId,
        userContent: {
          obj: ChatRoleEnum.Human,
          dataId: 'human-only',
          value: [{ text: { content: 'hello' } }]
        }
      })
    ).resolves.toBeUndefined();
  });

  it('should reject existing chat dataIds in generic history validation', async () => {
    await MongoChatItem.create({
      teamId: testUser.teamId,
      tmbId: testUser.tmbId,
      appId,
      chatId,
      dataId: 'existing-human',
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'old question' } }]
    });

    await expect(
      assertNoExistingChatDataIds({
        appId,
        chatId,
        dataIds: ['missing', 'existing-human']
      })
    ).rejects.toThrow(`${CHAT_DATA_ID_DUPLICATE_ERROR_MESSAGE}: existing-human`);
  });

  it('should skip generic history validation when all dataIds are empty', async () => {
    await expect(
      assertNoExistingChatDataIds({
        appId,
        chatId,
        dataIds: [undefined, '']
      })
    ).resolves.toBeUndefined();
  });

  it('should allow validating only the current human dataId for interactive submit', async () => {
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
        }
      })
    ).resolves.toBeUndefined();
  });
});
