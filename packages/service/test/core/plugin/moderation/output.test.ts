import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  MODERATION_BLOCKED_ERROR_MESSAGE,
  ModerationActionEnum,
  ModerationExceptionActionEnum,
  ModerationRiskActionEnum,
  ModerationStageEnum,
  type SystemModerationPolicyType
} from '@fastgpt/global/core/plugin/moderation/type';
import * as checkerMod from '../../../../core/plugin/moderation/checker';
import * as serviceMod from '../../../../core/plugin/moderation/service';
import {
  StreamModerationBuffer,
  checkOutputTextModeration,
  checkToolParamsModeration,
  createStreamModerationBuffer
} from '../../../../core/plugin/moderation/output';
import { dispatchAnswer } from '../../../../core/workflow/dispatch/tools/answer';
import { dispatchUserSelect } from '../../../../core/workflow/dispatch/interactive/userSelect';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('Output / Stream Guard (Anchor 3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const basePolicy: SystemModerationPolicyType = {
    enabled: true,
    activePluginId: 'test-plugin',
    hooks: {
      userInput: true,
      modelInput: true,
      finalOutput: true
    },
    strategy: {
      streamInterval: 30,
      suspectedRiskAction: ModerationRiskActionEnum.blockAndLog,
      serviceExceptionAction: ModerationExceptionActionEnum.pass
    }
  };

  beforeEach(() => {
    vi.spyOn(serviceMod, 'getModerationPolicy').mockResolvedValue(basePolicy);
  });

  describe('checkOutputTextModeration', () => {
    it('returns isPass: true when text passes', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.pass,
        isPass: true,
        text: 'safe output'
      });

      const res = await checkOutputTextModeration({
        text: 'safe output',
        policy: basePolicy
      });

      expect(res.isPass).toBe(true);
      expect(res.action).toBe(ModerationActionEnum.pass);
    });

    it('returns isPass: false when text violates moderation', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.block,
        isPass: false,
        text: 'toxic output'
      });

      const res = await checkOutputTextModeration({
        text: 'toxic output',
        policy: basePolicy
      });

      expect(res.isPass).toBe(false);
      expect(res.action).toBe(ModerationActionEnum.block);
    });

    it('passes empty or whitespace-only text immediately', async () => {
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy');

      const res = await checkOutputTextModeration({
        text: '   ',
        policy: basePolicy
      });

      expect(res.isPass).toBe(true);
      expect(checkerSpy).not.toHaveBeenCalled();
    });
  });

  describe('checkToolParamsModeration', () => {
    it('returns isPass: true when all tool arguments are safe', async () => {
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.pass,
        isPass: true,
        text: '{"city":"Beijing"}'
      });

      const res = await checkToolParamsModeration({
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'getWeather', arguments: '{"city":"Beijing"}' }
          }
        ],
        policy: basePolicy
      });

      expect(res.isPass).toBe(true);
      expect(checkerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '{"city":"Beijing"}',
          stage: ModerationStageEnum.output,
          targetField: 'toolParams.getWeather'
        })
      );
    });

    it('returns isPass: false and identifies tool when argument violates moderation', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.block,
        isPass: false,
        text: '{"cmd":"rm -rf /"}'
      });

      const res = await checkToolParamsModeration({
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'execBash', arguments: '{"cmd":"rm -rf /"}' }
          }
        ],
        policy: basePolicy
      });

      expect(res.isPass).toBe(false);
      expect(res.blockedToolName).toBe('execBash');
    });
  });

  describe('StreamModerationBuffer', () => {
    it('passes through immediately when hook is disabled', async () => {
      const approvedTexts: string[] = [];
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy');

      const buffer = new StreamModerationBuffer({
        isEnabled: false,
        onApprovedText: (t) => approvedTexts.push(t)
      });

      await buffer.push('Hello');
      await buffer.push(' World');
      await buffer.flush();

      expect(approvedTexts).toEqual(['Hello', ' World']);
      expect(checkerSpy).not.toHaveBeenCalled();
    });

    it('buffers deltas by streamInterval, verifies and emits approved chunks', async () => {
      const approvedTexts: string[] = [];
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.pass,
        isPass: true,
        text: 'chunk'
      });

      const buffer = new StreamModerationBuffer({
        streamInterval: 10,
        isEnabled: true,
        policy: basePolicy,
        onApprovedText: (t) => approvedTexts.push(t)
      });

      // 1. Push 6 chars: not reached threshold yet
      await buffer.push('123456');
      expect(approvedTexts).toEqual([]);

      // 2. Push 6 chars: total 12 chars -> triggers 10 chars chunk
      await buffer.push('7890ab');
      expect(approvedTexts).toEqual(['1234567890']);

      // 3. Flush remaining 2 chars ('ab')
      await buffer.flush();
      expect(approvedTexts).toEqual(['1234567890', 'ab']);
    });

    it('aborts model generation, stops emitting, and throws UserError when stream chunk is blocked', async () => {
      const approvedTexts: string[] = [];
      let blockedReason: string | undefined;
      const abortController = new AbortController();

      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(async ({ text }) => {
        if (text.includes('toxic')) {
          return {
            action: ModerationActionEnum.block,
            isPass: false,
            text
          };
        }
        return {
          action: ModerationActionEnum.pass,
          isPass: true,
          text
        };
      });

      const buffer = new StreamModerationBuffer({
        streamInterval: 10,
        isEnabled: true,
        policy: basePolicy,
        abortController,
        onApprovedText: (t) => approvedTexts.push(t),
        onBlocked: (reason) => {
          blockedReason = reason;
        }
      });

      // Safe chunk 1
      await buffer.push('safe1234567890');
      expect(approvedTexts).toEqual(['safe123456']);

      // Blocked chunk
      await expect(buffer.push('toxic_bomb_here')).rejects.toThrow(
        new UserError(MODERATION_BLOCKED_ERROR_MESSAGE)
      );

      expect(buffer.blocked).toBe(true);
      expect(abortController.signal.aborted).toBe(true);
      expect(blockedReason).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
      expect(approvedTexts).toEqual(['safe123456']); // toxic text discarded
    });
  });

  describe('dispatchAnswer (answerNode) output moderation', () => {
    it('halts and returns node error response when specified answer text is blocked', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.block,
        isPass: false,
        text: 'bad answer'
      });

      const streamSpy = vi.fn();

      const res = await dispatchAnswer({
        workflowStreamResponse: streamSpy,
        runningAppInfo: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'app_1',
          name: 'App',
          teamId: 'team_1',
          tmbId: 'tmb_1'
        },
        runningUserInfo: {
          teamId: 'team_1',
          tmbId: 'tmb_1',
          username: 'user',
          teamName: 'team',
          memberName: 'member',
          contact: ''
        },
        chatId: 'chat_1',
        responseChatItemId: 'resp_1',
        node: {
          nodeId: 'node_answer',
          name: 'Answer Node'
        },
        params: {
          text: 'illegal answer text'
        }
      });

      expect(streamSpy).not.toHaveBeenCalled();
      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(
        MODERATION_BLOCKED_ERROR_MESSAGE
      );
    });
  });

  describe('dispatchUserSelect (userSelect) output moderation', () => {
    it('halts and returns node error response when an option is blocked', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(async ({ text }) => {
        if (text === 'toxic option') {
          return {
            action: ModerationActionEnum.block,
            isPass: false,
            text
          };
        }
        return {
          action: ModerationActionEnum.pass,
          isPass: true,
          text
        };
      });

      const res = await dispatchUserSelect({
        node: {
          nodeId: 'node_select',
          name: 'User Select',
          inputs: [],
          isEntry: false
        },
        runningAppInfo: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'app_1',
          name: 'App',
          teamId: 'team_1',
          tmbId: 'tmb_1'
        },
        runningUserInfo: {
          teamId: 'team_1',
          tmbId: 'tmb_1',
          username: 'user',
          teamName: 'team',
          memberName: 'member',
          contact: ''
        },
        params: {
          description: 'Please pick an option',
          userSelectOptions: [
            { key: 'opt1', value: 'safe option' },
            { key: 'opt2', value: 'toxic option' }
          ]
        }
      } as any);

      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(
        MODERATION_BLOCKED_ERROR_MESSAGE
      );
    });
  });
});
