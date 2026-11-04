import { updateChatPublishSource } from '@fastgpt/service/core/chat/publishSource/service';
import {
  tryStartChatGenerationLease,
  getChatGenerationStatuses
} from '@fastgpt/service/core/chat/generationLease';
import { ChatGeneratingConflictError } from '@fastgpt/global/core/chat/error';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatGenerationLeaseCache } from '@fastgpt/dal/redis/lease/chat/chatGenerationLease';
import { createChatStopController, setAgentRuntimeStop } from '@fastgpt/service/core/chat/stop';
import {
  getPreparedRoundDataIds,
  NO_RECORD_CHAT_ID,
  prepareChatRound,
  preChatRound,
  stripUserContentFileUrls,
  type PrepareChatRoundParams,
  type PreChatRoundParams
} from '@fastgpt/service/core/chat/utils/prepare';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import {
  ChatSourceEnum,
  ChatFileTypeEnum,
  ChatGenerateStatusEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { MongoTeamMember } from '@fastgpt/service/support/user/team/teamMemberSchema';
import { MongoTeam } from '@fastgpt/service/support/user/team/teamSchema';
import { MongoUser } from '@fastgpt/service/support/user/schema';
import { TeamMemberRoleEnum } from '@fastgpt/global/support/user/team/constant';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';
import { failChatRound } from '@fastgpt/service/core/chat/saveChat';
import type { WorkflowInteractiveResponseType } from '@fastgpt/global/core/workflow/template/system/interactive/type';

const createPrepareParams = (
  overrides?: Partial<PrepareChatRoundParams>,
  ids?: { appId?: string; teamId?: string; tmbId?: string }
): PrepareChatRoundParams => ({
  chatId: 'test-chat-id',
  sourceType: ChatSourceTypeEnum.app,
  sourceId: ids?.appId || '67e0d5535c02d1d5cdede71f',
  teamId: ids?.teamId || '654a4107c32f3bf5f998452f',
  tmbId: ids?.tmbId || '65ab7007462ada7dbb899948',
  source: 'online' as any,
  userContent: {
    obj: ChatRoleEnum.Human,
    value: [
      {
        text: {
          content: 'Hello, how are you?'
        }
      }
    ]
  },
  responseChatItemId: 'test-response-data-id',
  ...overrides
});

const createPreChatRoundParams = (
  overrides?: Partial<PreChatRoundParams>,
  ids?: { appId?: string; teamId?: string; tmbId?: string }
): PreChatRoundParams => createPrepareParams(overrides, ids);

describe('prepare chat round', () => {
  let testAppId: string;
  let testTeamId: string;
  let testTmbId: string;

  beforeEach(async () => {
    const user = await MongoUser.create({
      username: 'test-user',
      password: 'test-password'
    });
    const team = await MongoTeam.create({
      name: 'Test Team',
      ownerId: user._id,
      avatar: 'test-avatar',
      createTime: new Date(),
      balance: 0
    });
    testTeamId = String(team._id);

    const teamMember = await MongoTeamMember.create({
      teamId: team._id,
      userId: user._id,
      name: 'Test Member',
      role: TeamMemberRoleEnum.owner,
      status: 'active',
      createTime: new Date(),
      defaultTeam: true
    });
    testTmbId = String(teamMember._id);

    const app = await MongoApp.create({
      name: 'Test App',
      type: AppTypeEnum.simple,
      teamId: team._id,
      tmbId: teamMember._id,
      avatar: 'test-avatar',
      intro: 'Test intro'
    });
    testAppId = String(app._id);
  });

  it('should pre-create a new chat round with generated chatId when chatId is empty', async () => {
    const params = createPreChatRoundParams(
      { chatId: '', responseChatItemId: 'generated-round-data-id' },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await preChatRound({
      chatId: params.chatId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: params.source,
      sourceName: params.sourceName,
      shareId: params.shareId,
      outLinkUid: params.outLinkUid,
      userContent: params.userContent,
      responseChatItemId: params.responseChatItemId
    });
    try {
      expect(result.chatId).toBeTruthy();
      expect(result.chatId).not.toBe('');
      expect(result.responseChatItemId).toBe('generated-round-data-id');
      expect(result.shouldPersistChatRound).toBe(true);
      expect(result.shouldFinalizePreparedRound).toBe(true);
      expect(params.userContent.dataId).toBe('generated-round-data-id');

      const chatItems = await MongoChatItem.find({ appId: testAppId, chatId: result.chatId });
      expect(chatItems).toHaveLength(2);
      expect(chatItems.map((item) => item.dataId)).toEqual([
        'generated-round-data-id',
        'generated-round-data-id'
      ]);
    } finally {
      await result.releaseGenerationLease?.();
    }
  });

  it('should skip persistence for no-record chat id and keep caller ids', async () => {
    const params = createPreChatRoundParams(
      {
        chatId: NO_RECORD_CHAT_ID,
        responseChatItemId: 'client-response-data-id'
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await preChatRound(params);
    try {
      expect(result).toEqual({
        chatId: NO_RECORD_CHAT_ID,
        responseChatItemId: 'client-response-data-id',
        shouldPersistChatRound: false,
        shouldFinalizePreparedRound: false
      });
      expect(await MongoChat.countDocuments({ appId: testAppId })).toBe(0);
      expect(await MongoChatItem.countDocuments({ appId: testAppId })).toBe(0);
    } finally {
      await result.releaseGenerationLease?.();
    }
  });

  it('preserves a stop received after lease acquisition while preparing the round', async () => {
    const params = createPreChatRoundParams(
      {},
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );
    const originalAcquire = ChatGenerationLeaseCache.prototype.tryAcquire;
    const acquire = vi
      .spyOn(ChatGenerationLeaseCache.prototype, 'tryAcquire')
      .mockImplementation(async function (this: ChatGenerationLeaseCache, input) {
        const acquired = await originalAcquire.call(this, input);
        if (acquired.acquired) await setAgentRuntimeStop(input.params);
        return acquired;
      });
    let prepared: Awaited<ReturnType<typeof preChatRound>> | undefined;
    try {
      prepared = await preChatRound(params);
      const controller = await createChatStopController({
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        chatId: prepared.chatId
      });
      try {
        expect(controller.checkIsStopping()).toBe(true);
      } finally {
        await controller.cleanup();
      }
    } finally {
      acquire.mockRestore();
      await prepared?.releaseGenerationLease?.();
    }
  });

  it('should generate responseChatItemId when client does not provide one', async () => {
    const params = createPreChatRoundParams(
      {
        responseChatItemId: undefined
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await preChatRound(params);
    try {
      expect(result.responseChatItemId).toBeTruthy();
      expect(result.shouldFinalizePreparedRound).toBe(true);
      expect(params.userContent.dataId).toBe(result.responseChatItemId);

      const chatItems = await MongoChatItem.find({ appId: testAppId, chatId: params.chatId });
      expect(chatItems).toHaveLength(2);
      expect(new Set(chatItems.map((item) => item.dataId))).toEqual(
        new Set([result.responseChatItemId])
      );
    } finally {
      await result.releaseGenerationLease?.();
    }
  });

  it('should reject when the chat is already generating', async () => {
    const originalUpdateTime = new Date('2026-01-01T00:00:00.000Z');
    const params = createPreChatRoundParams(
      {
        chatId: 'generating-chat-id',
        sourceName: 'new-source-name'
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );
    await MongoChat.create({
      appId: testAppId,
      chatId: params.chatId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      source: params.source,
      sourceName: 'original-source-name',
      updateTime: originalUpdateTime
    });

    const release = await tryStartChatGenerationLease({
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      chatId: params.chatId!
    });
    try {
      await expect(preChatRound(params)).rejects.toBe(ChatErrEnum.chatIsGenerating);

      const chat = await MongoChat.findOne({ appId: testAppId, chatId: params.chatId }).lean();
      expect(chat?.sourceName).toBe('original-source-name');
      expect(chat?.updateTime?.getTime()).toBe(originalUpdateTime.getTime());
      expect(chat).not.toHaveProperty('chatGenerateStatus');
      expect(await MongoChatItem.countDocuments({ appId: testAppId, chatId: params.chatId })).toBe(
        0
      );
    } finally {
      await release?.();
    }
  });

  it.each([false, true])(
    'preChat 交互续跑=%s：执行前写入本次来源，失败尾部保留来源',
    async (interactive) => {
      const params = createPreChatRoundParams(
        {
          source: 'api',
          publishSource: { type: ChatSourceEnum.api, id: testAppId },
          sourceName: '本次渠道'
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );
      await updateChatPublishSource({
        ...params,
        chatId: params.chatId!,
        sourceName: '上一渠道',
        publishSource: { type: ChatSourceEnum.api, id: testTmbId }
      });
      if (interactive) {
        await MongoChatItem.create({
          appId: testAppId,
          sourceType: ChatSourceTypeEnum.app,
          teamId: testTeamId,
          tmbId: testTmbId,
          chatId: params.chatId,
          obj: ChatRoleEnum.AI,
          dataId: 'previous-ai',
          value: []
        });
      }
      const prepared = await preChatRound({
        ...params,
        ...(interactive ? { interactive: { type: 'userSelect', params: {} } as any } : {})
      });
      try {
        const chat = await MongoChat.findOne({ appId: testAppId, chatId: params.chatId }).lean();
        expect(String(chat?.publishSource?.id)).toBe(testAppId);
        expect(chat?.sourceName).toBe('本次渠道');
        expect(prepared.responseChatItemId).toBe(
          interactive ? 'previous-ai' : params.responseChatItemId
        );
        const count = await MongoChatItem.countDocuments({
          appId: testAppId,
          chatId: params.chatId
        });
        expect(count).toBe(interactive ? 1 : 2);
        await failChatRound({
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          chatId: prepared.chatId,
          responseChatItemId: prepared.responseChatItemId,
          error: new Error('runtime failure')
        });
        expect(
          String(
            (await MongoChat.findOne({ appId: testAppId, chatId: params.chatId }).lean())
              ?.publishSource?.id
          )
        ).toBe(testAppId);
      } finally {
        await prepared.releaseGenerationLease?.();
      }
    }
  );

  it('rejects a second send before writing messages and identifies the original round', async () => {
    const params = createPreChatRoundParams(
      { chatId: 'busy-chat', responseChatItemId: 'active-A' },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );
    const active = await preChatRound(params);
    try {
      await expect(
        preChatRound({
          ...params,
          responseChatItemId: 'rejected-B',
          userContent: { ...params.userContent, value: [{ text: { content: 'rejected message' } }] }
        })
      ).rejects.toMatchObject({
        name: ChatGeneratingConflictError.name,
        data: { responseChatItemId: 'active-A' }
      });
      const records = await MongoChatItem.find({ appId: testAppId, chatId: params.chatId }).lean();
      expect(records).toHaveLength(2);
      expect(records.every((item) => item.dataId === 'active-A')).toBe(true);
      expect(await MongoChatItem.countDocuments({ dataId: 'rejected-B' })).toBe(0);
    } finally {
      await active.releaseGenerationLease?.();
    }
  });

  it('prepares a persisted round when acquiring the generation lease fails', async () => {
    const params = createPreChatRoundParams(
      { chatId: 'redis-unavailable-chat' },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );
    const acquire = vi
      .spyOn(ChatGenerationLeaseCache.prototype, 'tryAcquire')
      .mockRejectedValueOnce(new Error('Redis unavailable'));
    try {
      const prepared = await preChatRound(params);
      expect(prepared.shouldPersistChatRound).toBe(true);
      expect(prepared.shouldFinalizePreparedRound).toBe(true);
      expect(await MongoChat.countDocuments({ appId: testAppId, chatId: params.chatId })).toBe(1);
      const items = await MongoChatItem.find({ appId: testAppId, chatId: params.chatId }).lean();
      expect(items.map((item) => item.obj).sort()).toEqual(
        [ChatRoleEnum.Human, ChatRoleEnum.AI].sort()
      );
      await expect(prepared.releaseGenerationLease?.()).resolves.toBeUndefined();
    } finally {
      acquire.mockRestore();
    }
  });

  it('starts a new round despite a legacy Mongo generating field when no lease exists', async () => {
    const params = createPreChatRoundParams(
      { chatId: 'legacy-status-chat', responseChatItemId: 'legacy-new-round' },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );
    const chat = await MongoChat.create({
      appId: testAppId,
      chatId: params.chatId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      source: params.source,
      title: 'Existing title'
    });
    await MongoChat.collection.updateOne({ _id: chat._id }, { $set: { chatGenerateStatus: 0 } });
    const prepared = await preChatRound(params);
    try {
      expect(prepared.shouldFinalizePreparedRound).toBe(true);
      expect(
        (
          await getChatGenerationStatuses({
            sourceType: params.sourceType,
            sourceId: params.sourceId,
            chatIds: [prepared.chatId]
          })
        ).get(prepared.chatId)
      ).toBe(ChatGenerateStatusEnum.generating);
    } finally {
      await prepared.releaseGenerationLease?.();
    }
  });

  it('should reject duplicated AI dataId and release the lease for retry', async () => {
    const params = createPreChatRoundParams(
      { responseChatItemId: 'duplicated-ai-data-id' },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );
    await MongoChatItem.create({
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      appId: testAppId,
      chatId: params.chatId,
      dataId: 'duplicated-ai-data-id',
      obj: ChatRoleEnum.AI,
      value: []
    });

    await expect(
      preChatRound({
        chatId: params.chatId,
        sourceType: ChatSourceTypeEnum.app,
        sourceId: testAppId,
        teamId: testTeamId,
        tmbId: testTmbId,
        source: params.source,
        sourceName: params.sourceName,
        shareId: params.shareId,
        outLinkUid: params.outLinkUid,
        userContent: params.userContent,
        responseChatItemId: params.responseChatItemId
      })
    ).rejects.toThrow('Chat dataId already exists: duplicated-ai-data-id');

    const chat = await MongoChat.findOne({ appId: testAppId, chatId: params.chatId });
    expect(chat).toBeNull();

    // 准备失败必须释放 Redis 租约，使同一会话可以立即重试。
    const retry = await preChatRound({ ...params, responseChatItemId: 'retry-ai-data-id' });
    try {
      expect(retry.shouldFinalizePreparedRound).toBe(true);
    } finally {
      await retry.releaseGenerationLease?.();
    }
  });

  it('should reuse previous AI dataId for interactive continue without creating placeholders', async () => {
    const params = createPreChatRoundParams(
      { responseChatItemId: 'client-new-data-id' },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );
    await MongoChat.create({
      appId: testAppId,
      chatId: params.chatId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      source: params.source
    });
    await MongoChatItem.create({
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      appId: testAppId,
      chatId: params.chatId,
      dataId: 'previous-ai-data-id',
      obj: ChatRoleEnum.AI,
      value: [
        {
          text: {
            content: 'pending interactive'
          }
        }
      ]
    });

    const result = await preChatRound({
      chatId: params.chatId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: params.source,
      sourceName: params.sourceName,
      shareId: params.shareId,
      outLinkUid: params.outLinkUid,
      userContent: params.userContent,
      responseChatItemId: params.responseChatItemId,
      interactive: {
        type: 'userSelect',
        params: {}
      } as any
    });
    try {
      expect(result.responseChatItemId).toBe('previous-ai-data-id');
      expect(result.shouldFinalizePreparedRound).toBe(false);
      // 客户端传入的新 ID 不等于最终复用的 AI，冲突恢复必须刷新并复用已有记录。
      await expect(preChatRound(params)).rejects.toMatchObject({
        name: ChatGeneratingConflictError.name,
        data: { reusePreviousAi: true }
      });
      expect(await MongoChatItem.countDocuments({ appId: testAppId, chatId: params.chatId })).toBe(
        1
      );
    } finally {
      await result.releaseGenerationLease?.();
    }
  });

  it.each([
    { sourceType: ChatSourceTypeEnum.app, nested: true },
    { sourceType: ChatSourceTypeEnum.chatAgentHelper, nested: false },
    { sourceType: ChatSourceTypeEnum.workflowBuilder, nested: true }
  ])(
    'preserves a visible new user round for $sourceType Ask, even if generation fails',
    async ({ sourceType, nested }) => {
      const params = createPreChatRoundParams(
        {
          responseChatItemId: 'client-new-data-id',
          sourceType,
          userContent: {
            obj: ChatRoleEnum.Human,
            dataId: 'answer-human-id',
            hideInUI: false,
            value: [
              {
                select: {
                  type: 'agentAsk',
                  questions: [{ question: 'Audience?', value: 'A' }]
                }
              }
            ]
          }
        },
        { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
      );
      await MongoChat.create({
        appId: testAppId,
        chatId: params.chatId,
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: params.sourceType,
        source: params.source
      });
      await MongoChatItem.create({
        teamId: testTeamId,
        tmbId: testTmbId,
        sourceType: params.sourceType,
        appId: testAppId,
        chatId: params.chatId,
        dataId: 'previous-helper-ai-data-id',
        obj: ChatRoleEnum.AI,
        value: []
      });

      const ask: WorkflowInteractiveResponseType = {
        type: 'agentAsk',

        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: [],
        params: {
          toolCallId: 'chat-agent-helper-ask',
          arguments: JSON.stringify({
            reason: 'Collect requirements',
            blockerType: 'user_choice',
            questions: [
              {
                question: 'Audience?',
                options: [
                  { summary: 'A', value: 'A' },
                  { summary: 'B', value: 'B' }
                ]
              }
            ]
          })
        }
      };
      const result = await preChatRound({
        ...params,
        interactive: nested
          ? {
              type: 'childrenInteractive',
              entryNodeIds: [],
              memoryEdges: [],
              nodeOutputs: [],
              params: { childrenResponse: ask }
            }
          : ask
      });
      try {
        expect(result.responseChatItemId).toBe('client-new-data-id');
        expect(result.shouldFinalizePreparedRound).toBe(true);
        const records = await MongoChatItem.find({
          appId: testAppId,
          chatId: params.chatId,
          sourceType: params.sourceType
        }).sort({ _id: 1 });
        expect(records.map((record) => [record.obj, record.dataId])).toEqual([
          [ChatRoleEnum.AI, 'previous-helper-ai-data-id'],
          [ChatRoleEnum.Human, 'client-new-data-id'],
          [ChatRoleEnum.AI, 'client-new-data-id']
        ]);
        const human = records[1];
        if (human.obj !== ChatRoleEnum.Human) throw new Error('Expected the new user record');
        expect(human.hideInUI).toBe(false);
        expect(human.value).toEqual(params.userContent.value);
        expect(human.value[0]).not.toHaveProperty('askId');
        expect(human.value[0]).not.toHaveProperty('interactiveReply');
        expect(chatValue2RuntimePrompt(params.userContent.value).text).toBe('{"answers":["A"]}');
        await failChatRound({
          sourceType,
          sourceId: testAppId,
          chatId: result.chatId,
          responseChatItemId: result.responseChatItemId,
          error: new Error('Resume failed')
        });
        const refreshedHuman = await MongoChatItem.findById(human._id).lean();
        if (refreshedHuman?.obj !== ChatRoleEnum.Human) throw new Error('User record disappeared');
        expect(refreshedHuman?.value).toEqual(human.value);
        expect(refreshedHuman?.hideInUI).toBe(false);
        const failedAi = await MongoChatItem.findById(records[2]._id).lean();
        if (failedAi?.obj !== ChatRoleEnum.AI) throw new Error('Expected the new AI record');
        expect(failedAi?.errorMsg).toBe('Resume failed');
      } finally {
        await result.releaseGenerationLease?.();
      }
    }
  );

  it('should release the lease when interactive continue has no previous AI item', async () => {
    const params = createPreChatRoundParams(
      {
        chatId: 'interactive-missing-ai-chat-id',
        responseChatItemId: 'client-new-data-id'
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    await expect(
      preChatRound({
        ...params,
        interactive: {
          type: 'userSelect',
          params: {}
        } as any
      })
    ).rejects.toThrow(`Interactive continue chat item not found: ${params.chatId}`);

    const chat = await MongoChat.findOne({ appId: testAppId, chatId: params.chatId });
    expect(chat).toBeNull();
    const statuses = await getChatGenerationStatuses({
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      chatIds: [params.chatId!]
    });
    expect(statuses.get(params.chatId!)).toBe(ChatGenerateStatusEnum.done);
    expect(await MongoChatItem.countDocuments({ appId: testAppId, chatId: params.chatId })).toBe(0);
  });

  it('should treat agentAsk interactive as a new round', async () => {
    const params = createPreChatRoundParams(
      {
        responseChatItemId: 'agent-plan-query-data-id'
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await preChatRound({
      ...params,
      interactive: {
        type: 'agentAsk',

        params: {
          toolCallId: 'call_ask',
          arguments: JSON.stringify({
            reason: '',
            blockerType: 'user_choice',
            questions: [
              {
                question: 'Need more input',
                options: [
                  { summary: 'Use repo', value: 'Use repo' },
                  { summary: 'Use docs', value: 'Use docs' },
                  { summary: 'Use defaults', value: 'Use defaults' }
                ]
              }
            ]
          })
        }
      } as any
    });
    try {
      expect(result.responseChatItemId).toBe('agent-plan-query-data-id');
      expect(result.shouldFinalizePreparedRound).toBe(true);
      expect(await MongoChatItem.countDocuments({ appId: testAppId, chatId: params.chatId })).toBe(
        2
      );
    } finally {
      await result.releaseGenerationLease?.();
    }
  });

  it('should treat an agentAsk nested in a child tool as a new round', async () => {
    const params = createPreChatRoundParams(
      {
        responseChatItemId: 'nested-agent-query-data-id'
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await preChatRound({
      ...params,
      interactive: {
        type: 'toolChildrenInteractive',
        params: {
          toolCallId: 'tool_1',
          childrenResponse: {
            type: 'agentAsk',

            params: {
              toolCallId: 'call_ask',
              arguments: JSON.stringify({
                reason: '',
                blockerType: 'user_choice',
                questions: [
                  {
                    question: 'Need more input',
                    options: [
                      { summary: 'Use repo', value: 'Use repo' },
                      { summary: 'Use docs', value: 'Use docs' },
                      { summary: 'Use defaults', value: 'Use defaults' }
                    ]
                  }
                ]
              })
            }
          }
        }
      } as any
    });
    try {
      expect(result.responseChatItemId).toBe('nested-agent-query-data-id');
      expect(result.shouldFinalizePreparedRound).toBe(true);
      expect(await MongoChatItem.countDocuments({ appId: testAppId, chatId: params.chatId })).toBe(
        2
      );
    } finally {
      await result.releaseGenerationLease?.();
    }
  });

  it('should prepare chat and placeholders without persisting runtime status', async () => {
    const responseChatItemId = 'prepared-ai-item';
    const params = createPrepareParams(
      { responseChatItemId },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    await updateChatPublishSource(params);
    const result = await prepareChatRound({
      chatId: params.chatId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: params.source,
      sourceName: params.sourceName,
      shareId: params.shareId,
      outLinkUid: params.outLinkUid,
      userContent: params.userContent,
      responseChatItemId
    });

    expect(result.shouldGenerateTitle).toBe(true);
    expect(params.userContent.dataId).toBeDefined();
    expect(params.userContent.dataId).toBe(responseChatItemId);

    const chat = await MongoChat.findOne({ appId: testAppId, chatId: params.chatId });
    expect(chat).not.toHaveProperty('chatGenerateStatus');
    expect(chat?.hasBeenRead).toBe(false);

    const chatItems = await MongoChatItem.find({ appId: testAppId, chatId: params.chatId });
    expect(chatItems).toHaveLength(2);

    const humanItem = chatItems.find((item) => item.obj === ChatRoleEnum.Human);
    expect(humanItem?.dataId).toBe(responseChatItemId);
    expect(humanItem?.value[0].text?.content).toBe('Hello, how are you?');

    const aiItem = chatItems.find((item) => item.obj === ChatRoleEnum.AI);
    expect(aiItem?.dataId).toBe(responseChatItemId);
    expect(aiItem?.value).toEqual([]);
  });

  it('should skip title generation when prepared chat already has a custom title', async () => {
    const params = createPrepareParams(
      { responseChatItemId: 'prepared-ai-item-with-title' },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    await MongoChat.create({
      chatId: params.chatId,
      appId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      sourceType: ChatSourceTypeEnum.app,
      source: params.source,
      title: 'Manual Topic',
      customTitle: 'Manual Topic'
    });

    const result = await prepareChatRound({
      chatId: params.chatId,
      sourceType: ChatSourceTypeEnum.app,
      sourceId: testAppId,
      teamId: testTeamId,
      tmbId: testTmbId,
      source: params.source,
      sourceName: params.sourceName,
      shareId: params.shareId,
      outLinkUid: params.outLinkUid,
      userContent: params.userContent,
      responseChatItemId: params.responseChatItemId!
    });

    expect(result.shouldGenerateTitle).toBe(false);
  });

  it('should skip direct prepare for no-record chat id', async () => {
    const params = createPrepareParams(
      {
        chatId: NO_RECORD_CHAT_ID,
        responseChatItemId: 'no-record-data-id'
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    const result = await prepareChatRound(params);

    expect(result.shouldGenerateTitle).toBe(false);
    expect(params.userContent.dataId).toBeUndefined();
    expect(await MongoChat.countDocuments({ appId: testAppId })).toBe(0);
    expect(await MongoChatItem.countDocuments({ appId: testAppId })).toBe(0);
  });

  it('should strip persisted file URLs before creating human placeholder', async () => {
    const params = createPrepareParams(
      {
        responseChatItemId: 'file-round-data-id',
        userContent: {
          obj: ChatRoleEnum.Human,
          value: [
            {
              file: {
                type: ChatFileTypeEnum.file,
                name: 'report.pdf',
                key: 'chat-files/report.pdf',
                url: 'https://signed-url.example/report.pdf'
              }
            }
          ]
        }
      },
      { appId: testAppId, teamId: testTeamId, tmbId: testTmbId }
    );

    await updateChatPublishSource(params);
    await prepareChatRound(params);

    const humanItem = await MongoChatItem.findOne({
      appId: testAppId,
      chatId: params.chatId,
      obj: ChatRoleEnum.Human
    });
    expect(humanItem?.value[0].file?.url).toBe('');
    expect(params.userContent.value[0].file?.url).toBe('https://signed-url.example/report.pdf');
  });

  it('should only strip file URL when file key exists', () => {
    const userContent = {
      obj: ChatRoleEnum.Human,
      value: [
        {
          file: {
            type: ChatFileTypeEnum.file,
            name: 'local.pdf',
            url: 'blob:http://localhost/file'
          }
        }
      ]
    } as any;

    stripUserContentFileUrls(userContent);

    expect(userContent.value[0].file.url).toBe('blob:http://localhost/file');
  });

  it('should return prepared human and ai dataIds and reject missing values', () => {
    expect(
      getPreparedRoundDataIds({
        userContent: {
          obj: ChatRoleEnum.Human,
          dataId: 'human-data-id',
          value: []
        },
        aiContent: {
          obj: ChatRoleEnum.AI,
          dataId: 'ai-data-id',
          value: []
        }
      })
    ).toEqual({
      humanDataId: 'human-data-id',
      aiDataId: 'ai-data-id'
    });

    expect(() =>
      getPreparedRoundDataIds({
        userContent: {
          obj: ChatRoleEnum.Human,
          value: []
        },
        aiContent: {
          obj: ChatRoleEnum.AI,
          dataId: 'ai-data-id',
          value: []
        }
      })
    ).toThrow('Pending chat round human dataId is missing');

    expect(() =>
      getPreparedRoundDataIds({
        userContent: {
          obj: ChatRoleEnum.Human,
          dataId: 'human-data-id',
          value: []
        },
        aiContent: {
          obj: ChatRoleEnum.AI,
          value: []
        }
      })
    ).toThrow('Pending chat round ai dataId is missing');
  });
});
