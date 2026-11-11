import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  MODERATION_BLOCKED_ERROR_MESSAGE,
  ModerationActionEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import * as checkerMod from '../../../../core/plugin/moderation/checker';
import * as serviceMod from '../../../../core/plugin/moderation/service';
import { dispatchWorkFlow } from '../../../../core/workflow/dispatch';
import { ChatSourceTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { preChatRound } from '../../../../core/chat/utils/prepare';
import { MongoChat } from '../../../../core/chat/chatSchema';
import { MongoChatItem } from '../../../../core/chat/chatItemSchema';

describe('dispatchWorkFlow Entry Guard integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects dispatchWorkFlow immediately when entry moderation fails and does not execute nodes', async () => {
    vi.spyOn(serviceMod, 'getModerationPolicy').mockResolvedValue({
      enabled: true,
      activePluginId: 'test-plugin',
      hooks: {
        userInput: true,
        modelInput: false,
        finalOutput: false
      },
      strategy: {
        streamInterval: 50,
        suspectedRiskAction: 'blockAndLog' as any,
        serviceExceptionAction: 'pass' as any
      }
    });

    vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
      action: ModerationActionEnum.block,
      isPass: false,
      text: 'illegal prompt'
    });

    await expect(
      dispatchWorkFlow({
        apiVersion: 'v1',
        mode: 'chat',
        stream: false,
        chatId: 'chat_1',
        responseChatItemId: 'resp_1',
        query: [{ text: { content: 'illegal prompt' } }],
        variables: {},
        runtimeNodes: [],
        runtimeEdges: [],
        maxFileAmount: 5,
        maxBytesPerFile: 1024 * 1024,
        maxRunTimes: 10,
        usageSource: 'fastgpt' as any,
        usageId: 'usage_1',
        concatUsage: vi.fn(),
        runningAppInfo: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'app_1',
          name: 'Test App',
          teamId: 'team_1',
          tmbId: 'tmb_1'
        },
        runningUserInfo: {
          username: 'user',
          teamName: 'team',
          memberName: 'member',
          contact: '',
          teamId: 'team_1',
          tmbId: 'tmb_1'
        },
        uid: 'user_1',
        histories: [],
        nodeResponseWriteConfig: {
          persistToDb: false,
          retainInMemory: false
        }
      })
    ).rejects.toThrow(new UserError(MODERATION_BLOCKED_ERROR_MESSAGE));
  });

  it('rejects preChatRound before persisting chat or chat items when entry moderation blocks user input', async () => {
    vi.spyOn(serviceMod, 'getModerationPolicy').mockResolvedValue({
      enabled: true,
      activePluginId: 'test-plugin',
      hooks: {
        userInput: true,
        modelInput: false,
        finalOutput: false
      },
      strategy: {
        streamInterval: 50,
        suspectedRiskAction: 'blockAndLog' as any,
        serviceExceptionAction: 'pass' as any
      }
    });

    vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
      action: ModerationActionEnum.block,
      isPass: false,
      text: '甲基苯丙胺'
    });

    const chatCreateSpy = vi.spyOn(MongoChat, 'findOneAndUpdate');
    const chatItemCreateSpy = vi.spyOn(MongoChatItem, 'create');

    await expect(
      preChatRound({
        sourceType: ChatSourceTypeEnum.app,
        sourceId: '67e0d5535c02d1d5cdede71f',
        chatId: 'blocked-chat-id',
        teamId: '654a4107c32f3bf5f998452f',
        tmbId: '65ab7007462ada7dbb899948',
        source: 'online' as any,
        userContent: {
          obj: ChatRoleEnum.Human,
          value: [{ text: { content: '甲基苯丙胺' } }]
        },
        responseChatItemId: 'blocked-resp-id'
      })
    ).rejects.toThrow(new UserError(MODERATION_BLOCKED_ERROR_MESSAGE));

    expect(chatCreateSpy).not.toHaveBeenCalled();
    expect(chatItemCreateSpy).not.toHaveBeenCalled();
  });

  it('still checks variables in dispatchWorkFlow when preChatRound omitted variables without re-checking query', async () => {
    vi.spyOn(serviceMod, 'getModerationPolicy').mockResolvedValue({
      enabled: true,
      activePluginId: 'test-plugin',
      hooks: {
        userInput: true,
        modelInput: false,
        finalOutput: false
      },
      strategy: {
        streamInterval: 50,
        suspectedRiskAction: 'blockAndLog' as any,
        serviceExceptionAction: 'pass' as any
      }
    });

    const checkSpy = vi
      .spyOn(checkerMod, 'checkContentByPolicy')
      .mockImplementation(async ({ text }) => ({
        action: text === 'blocked-var' ? ModerationActionEnum.block : ModerationActionEnum.pass,
        isPass: text !== 'blocked-var',
        text
      }));

    await preChatRound({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: '67e0d5535c02d1d5cdede71f',
      chatId: 'NO_RECORD_HISTORIES',
      teamId: '654a4107c32f3bf5f998452f',
      tmbId: '65ab7007462ada7dbb899948',
      source: 'online' as any,
      userContent: {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'safe question' } }]
      },
      responseChatItemId: 'resp-missing-vars'
    });

    expect(checkSpy).toHaveBeenCalledTimes(1);
    expect(checkSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetField: 'query', text: 'safe question' })
    );

    await expect(
      dispatchWorkFlow({
        apiVersion: 'v1',
        mode: 'chat',
        stream: false,
        chatId: 'NO_RECORD_HISTORIES',
        responseChatItemId: 'resp-missing-vars',
        query: [{ text: { content: 'safe question' } }],
        variables: { customField: 'blocked-var' },
        runtimeNodes: [],
        runtimeEdges: [],
        maxFileAmount: 5,
        maxBytesPerFile: 1024 * 1024,
        maxRunTimes: 10,
        usageSource: 'fastgpt' as any,
        usageId: 'usage_1',
        concatUsage: vi.fn(),
        runningAppInfo: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: '67e0d5535c02d1d5cdede71f',
          name: 'Test App',
          teamId: '654a4107c32f3bf5f998452f',
          tmbId: '65ab7007462ada7dbb899948'
        },
        runningUserInfo: {
          username: 'user',
          teamName: 'team',
          memberName: 'member',
          contact: '',
          teamId: '654a4107c32f3bf5f998452f',
          tmbId: '65ab7007462ada7dbb899948'
        },
        uid: 'user_1',
        histories: [],
        nodeResponseWriteConfig: {
          persistToDb: false,
          retainInMemory: false
        }
      })
    ).rejects.toThrow(new UserError(MODERATION_BLOCKED_ERROR_MESSAGE));

    // query was NOT re-checked; only variable.customField was checked
    expect(checkSpy).toHaveBeenCalledTimes(2);
    expect(checkSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ targetField: 'variable.customField', text: 'blocked-var' })
    );
  });
});
