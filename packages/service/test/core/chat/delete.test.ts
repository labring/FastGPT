import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { deleteChatResourcesBySource } from '@fastgpt/service/core/chat/delete';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';

const mocks = vi.hoisted(() => ({
  deleteAppChatRuntimeSandboxes: vi.fn(),
  deleteChatFilesByPrefix: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/application/resource', () => ({
  deleteAppChatRuntimeSandboxes: mocks.deleteAppChatRuntimeSandboxes
}));

vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({
    deleteChatFilesByPrefix: mocks.deleteChatFilesByPrefix
  })
}));

const createChatTree = async ({
  sourceType,
  sourceId,
  chatId = getNanoid(),
  legacy = false,
  source = ChatSourceEnum.online
}: {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  chatId?: string;
  legacy?: boolean;
  source?: ChatSourceEnum;
}) => {
  const teamId = '65f000000000000000000001';
  const tmbId = '65f000000000000000000002';
  const chatSource = legacy ? {} : { sourceType };

  await MongoChat.create({
    ...chatSource,
    teamId,
    tmbId,
    appId: sourceId,
    chatId,
    source,
    title: `chat-${chatId}`
  });
  await MongoChatItem.create({
    ...chatSource,
    teamId,
    tmbId,
    appId: sourceId,
    chatId,
    dataId: getNanoid(),
    obj: ChatRoleEnum.AI,
    value: [{ text: { content: 'answer' } }]
  });
  await MongoChatItemResponse.create({
    ...chatSource,
    teamId,
    appId: sourceId,
    chatId,
    chatItemDataId: getNanoid(),
    data: { nodeId: 'node-1' }
  });

  if (legacy) {
    await Promise.all([
      MongoChat.updateMany({ appId: sourceId, chatId }, { $unset: { sourceType: '' } }),
      MongoChatItem.updateMany({ appId: sourceId, chatId }, { $unset: { sourceType: '' } }),
      MongoChatItemResponse.updateMany({ appId: sourceId, chatId }, { $unset: { sourceType: '' } })
    ]);
  }

  return { chatId, teamId, tmbId };
};

describe('deleteChatResourcesBySource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteAppChatRuntimeSandboxes.mockResolvedValue(undefined);
    mocks.deleteChatFilesByPrefix.mockResolvedValue(undefined);
  });

  it('deletes app legacy and source-aware chat resources by source', async () => {
    const sourceId = '65f000000000000000000003';
    const legacyChat = await createChatTree({
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      legacy: true
    });
    const newChat = await createChatTree({
      sourceType: ChatSourceTypeEnum.app,
      sourceId
    });

    await deleteChatResourcesBySource({
      sourceType: ChatSourceTypeEnum.app,
      sourceId
    });

    expect(await MongoChat.countDocuments({ appId: sourceId })).toBe(0);
    expect(await MongoChatItem.countDocuments({ appId: sourceId })).toBe(0);
    expect(await MongoChatItemResponse.countDocuments({ appId: sourceId })).toBe(0);
    expect(mocks.deleteAppChatRuntimeSandboxes).toHaveBeenCalledWith({
      appId: sourceId,
      chatIds: expect.arrayContaining([legacyChat.chatId, newChat.chatId])
    });
    expect(mocks.deleteChatFilesByPrefix).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId
    });
  });

  it('does nothing when chatIds is explicitly empty', async () => {
    const sourceId = '65f000000000000000000006';
    await createChatTree({
      sourceType: ChatSourceTypeEnum.app,
      sourceId
    });

    await deleteChatResourcesBySource({
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      chatIds: []
    });

    expect(await MongoChat.countDocuments({ appId: sourceId })).toBe(1);
    expect(await MongoChatItem.countDocuments({ appId: sourceId })).toBe(1);
    expect(await MongoChatItemResponse.countDocuments({ appId: sourceId })).toBe(1);
    expect(mocks.deleteAppChatRuntimeSandboxes).not.toHaveBeenCalled();
    expect(mocks.deleteChatFilesByPrefix).not.toHaveBeenCalled();
  });

  it('deletes skill edit chat resources without deleting app chat sandboxes', async () => {
    const sourceId = '65f000000000000000000004';
    const { chatId, tmbId } = await createChatTree({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId
    });

    await deleteChatResourcesBySource({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId,
      chatIds: [chatId]
    });

    expect(await MongoChat.countDocuments({ appId: sourceId })).toBe(0);
    expect(await MongoChatItem.countDocuments({ appId: sourceId })).toBe(0);
    expect(await MongoChatItemResponse.countDocuments({ appId: sourceId })).toBe(0);
    expect(mocks.deleteAppChatRuntimeSandboxes).not.toHaveBeenCalled();
    expect(mocks.deleteChatFilesByPrefix).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId,
      chatId,
      uId: tmbId
    });
  });
});
