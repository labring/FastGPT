import { afterEach, describe, expect, it, vi } from 'vitest';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  MODERATION_BLOCKED_ERROR_MESSAGE,
  ModerationActionEnum
} from '@fastgpt/global/core/plugin/moderation/type';
import * as checkerMod from '../../../../core/plugin/moderation/checker';
import * as serviceMod from '../../../../core/plugin/moderation/service';
import { dispatchWorkFlow } from '../../../../core/workflow/dispatch';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

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
});
