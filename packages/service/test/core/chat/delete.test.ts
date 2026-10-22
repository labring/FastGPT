import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatRoleEnum,
  ChatSourceEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  deleteChatResourcesBySource,
  softDeleteChatItems
} from '@fastgpt/service/core/chat/delete';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChatItemResponse } from '@fastgpt/service/core/chat/chatItemResponseSchema';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { getLastInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';

describe('softDeleteChatItems', () => {
  it.each(['agentAsk', 'workflowBuilderPreview'] as const)(
    'deletes a reply round and exposes the original %s without modifying it',
    async (type) => {
      const sourceId = '65f000000000000000000003';
      const sourceType = ChatSourceTypeEnum.workflowBuilder;
      const { chatId, teamId, tmbId } = await createChatTree({ sourceType, sourceId });
      const source = { sourceType, appId: sourceId, chatId, teamId, tmbId };
      const runtime = { entryNodeIds: [], memoryEdges: [], nodeOutputs: [] };
      const interactive: WorkflowInteractiveResponseType =
        type === 'agentAsk'
          ? {
              ...runtime,
              type,
              askId: 'ask-1',
              params: {
                description: '',
                questions: [
                  {
                    question: 'Choose?',
                    options: [
                      { summary: 'A', value: 'A' },
                      { summary: 'B', value: 'B' }
                    ]
                  }
                ]
              }
            }
          : {
              ...runtime,
              type,
              previewId: 'preview-1',
              params: {
                title: 'Confirm?',
                mermaid: 'flowchart LR; A --> B',
                sections: [],
                actions: [
                  { value: 'confirm', label: 'Confirm', inputMode: 'none' },
                  { value: 'revise', label: 'Revise', inputMode: 'text' },
                  { value: 'cancel', label: 'Cancel', inputMode: 'none' }
                ]
              }
            };
      const previous = await MongoChatItem.create({
        ...source,
        obj: ChatRoleEnum.AI,
        dataId: 'previous-ai',
        value: [{ interactive }]
      });
      const user = await MongoChatItem.create({
        ...source,
        obj: ChatRoleEnum.Human,
        dataId: 'reply-round',
        value: [{ select: { type, questions: [{ question: 'Choose?', value: 'A' }] } }]
      });
      const ai = await MongoChatItem.create({
        ...source,
        obj: ChatRoleEnum.AI,
        dataId: 'reply-round',
        value: [{ text: { content: 'Continued' } }]
      });
      await softDeleteChatItems({ sourceType, sourceId, chatId, contentIds: ['reply-round'] });
      const remaining = await MongoChatItem.find({
        sourceType,
        appId: sourceId,
        chatId,
        deleteTime: null
      })
        .sort({ _id: 1 })
        .lean();
      expect(remaining.at(-1)?.value).toEqual(previous.toObject().value);
      expect(getLastInteractiveValue(remaining)).toEqual(interactive);
      for (const item of [user, ai])
        expect((await MongoChatItem.findById(item._id).lean())?.deleteTime).toBeInstanceOf(Date);
    }
  );

  it('does nothing for an empty deletion list', async () => {
    const update = vi.spyOn(MongoChatItem, 'updateMany');
    await softDeleteChatItems({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '65f000000000000000000003',
      chatId: 'chat',
      contentIds: []
    });
    expect(update).not.toHaveBeenCalled();
    update.mockRestore();
  });
});

const mocks = vi.hoisted(() => ({ deleteChatFilesByPrefix: vi.fn() }));
vi.mock('@fastgpt/service/common/s3/sources/chat', () => ({
  getS3ChatSource: () => ({ deleteChatFilesByPrefix: mocks.deleteChatFilesByPrefix })
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
  const chatSource = { sourceType };

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
    mocks.deleteChatFilesByPrefix.mockResolvedValue(undefined);
  });

  it('deletes app legacy and source-aware chat resources by source', async () => {
    const sourceId = '65f000000000000000000003';
    await createChatTree({
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      legacy: true
    });
    await createChatTree({
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
    expect(mocks.deleteChatFilesByPrefix).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId,
      chatId,
      uId: tmbId
    });
  });

  it('deletes all child tables and only the member file prefixes after checking ownership once', async () => {
    const sourceId = '65f000000000000000000007';
    const { chatId, teamId, tmbId } = await createChatTree({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId
    });
    const query = vi.spyOn(MongoChat, 'find');
    try {
      await deleteChatResourcesBySource({
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        sourceId,
        chatIds: [chatId, chatId, 'missing'],
        scope: { teamId, tmbId }
      });
      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      query.mockRestore();
    }
    expect(await MongoChat.countDocuments({ appId: sourceId })).toBe(0);
    expect(await MongoChatItem.countDocuments({ appId: sourceId })).toBe(0);
    // response 记录没有 tmbId 字段，不能把成员过滤条件直接复制给子表。
    expect(await MongoChatItemResponse.countDocuments({ appId: sourceId })).toBe(0);
    expect(mocks.deleteChatFilesByPrefix).toHaveBeenCalledExactlyOnceWith({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId,
      chatId,
      uId: tmbId
    });
  });

  it('rejects a mixed-owner batch before deleting any records or files', async () => {
    const sourceId = '65f000000000000000000008';
    const first = await createChatTree({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId
    });
    const second = await createChatTree({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId
    });
    await MongoChat.updateOne(
      { appId: sourceId, chatId: second.chatId },
      { tmbId: '65f000000000000000000009' }
    );
    await expect(
      deleteChatResourcesBySource({
        sourceType: ChatSourceTypeEnum.workflowBuilder,
        sourceId,
        chatIds: [first.chatId, second.chatId],
        scope: { teamId: first.teamId, tmbId: first.tmbId }
      })
    ).rejects.toBe(ChatErrEnum.unAuthChat);
    expect(await MongoChat.countDocuments({ appId: sourceId })).toBe(2);
    expect(await MongoChatItem.countDocuments({ appId: sourceId })).toBe(2);
    expect(await MongoChatItemResponse.countDocuments({ appId: sourceId })).toBe(2);
    expect(mocks.deleteChatFilesByPrefix).not.toHaveBeenCalled();
  });

  it('does not delete orphaned child records for an unverified chat ID', async () => {
    const sourceId = '65f000000000000000000010';
    const { chatId, teamId, tmbId } = await createChatTree({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId
    });
    await MongoChat.deleteOne({ appId: sourceId, chatId });
    await deleteChatResourcesBySource({
      sourceType: ChatSourceTypeEnum.workflowBuilder,
      sourceId,
      chatIds: [chatId],
      scope: { teamId, tmbId }
    });
    expect(await MongoChatItem.countDocuments({ appId: sourceId })).toBe(1);
    expect(await MongoChatItemResponse.countDocuments({ appId: sourceId })).toBe(1);
    expect(mocks.deleteChatFilesByPrefix).not.toHaveBeenCalled();
  });

  it('preserves resource-level cleanup of explicitly selected orphaned App records', async () => {
    const sourceId = '65f000000000000000000011';
    const { chatId, teamId } = await createChatTree({
      sourceType: ChatSourceTypeEnum.app,
      sourceId
    });
    await MongoChat.deleteOne({ appId: sourceId, chatId });
    await deleteChatResourcesBySource({
      sourceType: ChatSourceTypeEnum.app,
      sourceId,
      chatIds: [chatId],
      scope: { teamId }
    });
    expect(await MongoChatItem.countDocuments({ appId: sourceId })).toBe(0);
    expect(await MongoChatItemResponse.countDocuments({ appId: sourceId })).toBe(0);
    expect(mocks.deleteChatFilesByPrefix).not.toHaveBeenCalled();
  });
});
