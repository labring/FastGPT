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
});
