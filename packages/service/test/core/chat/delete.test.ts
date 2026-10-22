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
import { extractDeepestInteractive } from '@fastgpt/global/core/workflow/runtime/utils';

describe('softDeleteChatItems', () => {
  it.each([
    { type: 'agentAsk' as const, retry: false, matching: true },
    { type: 'workflowBuilderPreview' as const, retry: false, matching: true },
    { type: 'agentAsk' as const, retry: true, matching: true },
    { type: 'workflowBuilderPreview' as const, retry: true, matching: true },
    { type: 'agentAsk' as const, retry: true, matching: false }
  ])(
    'reopens $type only for its explicit retry (retry: $retry, matching: $matching)',
    async ({ type, retry, matching }) => {
      const sourceId = '65f000000000000000000003';
      const sourceType = ChatSourceTypeEnum.workflowBuilder;
      const { chatId, teamId, tmbId } = await createChatTree({ sourceType, sourceId });
      const source = { sourceType, appId: sourceId, chatId, teamId, tmbId };
      const runtime = { entryNodeIds: [], memoryEdges: [], nodeOutputs: [] };
      const answered: WorkflowInteractiveResponseType =
        type === 'agentAsk'
          ? {
              ...runtime,
              type,
              askId: 'interaction-1',
              params: {
                description: '',
                submitted: true,
                questions: [{ question: 'Choose?', options: [], answer: 'Answer' }]
              }
            }
          : {
              ...runtime,
              type: 'childrenInteractive',
              params: {
                childrenResponse: {
                  ...runtime,
                  type,
                  previewId: 'interaction-1',
                  params: {
                    title: 'Confirm?',
                    mermaid: '',
                    sections: [],
                    actions: [],
                    answerValue: 'revise',
                    answerText: 'Add a review branch'
                  }
                }
              }
            };
      const previousAi = await MongoChatItem.create({
        ...source,
        obj: ChatRoleEnum.AI,
        dataId: 'previous-ai',
        value: [{ interactive: answered }]
      });
      const user = await MongoChatItem.create({
        ...source,
        obj: ChatRoleEnum.Human,
        dataId: 'reply-round',
        value: [
          {
            text: { content: 'Answer' },
            interactiveReply: {
              type,
              interactionId: matching ? 'interaction-1' : 'other-interaction',
              questions: [{ question: 'Choose?', answer: 'Answer' }]
            }
          }
        ]
      });
      const nextAi = await MongoChatItem.create({
        ...source,
        obj: ChatRoleEnum.AI,
        dataId: 'reply-round',
        value: [{ text: { content: 'Continued' } }]
      });

      await softDeleteChatItems({
        sourceType,
        sourceId,
        chatId,
        contentIds: ['reply-round'],
        retry
      });
      const records = await MongoChatItem.find({
        sourceType,
        appId: sourceId,
        chatId,
        deleteTime: null
      })
        .sort({ _id: 1 })
        .lean();
      expect(records.at(-1)?._id.toString()).toBe(previousAi._id.toString());
      const remainingAi = records.at(-1);
      if (remainingAi?.obj !== ChatRoleEnum.AI || !remainingAi.value[0].interactive) {
        throw new Error('Expected the original answered interaction');
      }
      if (retry && matching) {
        const interactive = extractDeepestInteractive(remainingAi.value[0].interactive);
        if (interactive.type === 'agentAsk') {
          expect(interactive.params.submitted).toBe(false);
          expect(interactive.params.questions[0].answer).toBe('');
        } else if (interactive.type === 'workflowBuilderPreview') {
          expect(interactive.params.answerValue).toBeUndefined();
          expect(interactive.params.answerText).toBeUndefined();
        } else throw new Error('Expected the original interaction');
      } else {
        expect(remainingAi.value).toEqual(previousAi.toObject().value);
        expect(extractDeepestInteractive(remainingAi.value[0].interactive)).toEqual(
          extractDeepestInteractive(answered)
        );
      }
      for (const item of [user, nextAi]) {
        const deleted = await MongoChatItem.findById(item._id).lean();
        expect(deleted?.deleteTime).toBeInstanceOf(Date);
      }
    }
  );
});

const mocks = vi.hoisted(() => ({
  deleteChatFilesByPrefix: vi.fn()
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
