import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  MODERATION_BLOCKED_ERROR_MESSAGE,
  ModerationActionEnum,
  ModerationExceptionActionEnum,
  ModerationRiskActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type { SystemModerationPolicyType } from '@fastgpt/global/core/plugin/moderation/type';
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

    it('returns isPass: false and identifies blocked tool call IDs when argument violates moderation', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.replace,
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
      expect(res.blockedToolCallIds).toEqual(['call_1']);
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

      // 2. Push 6 chars: total 12 chars -> triggers 10 chars cumulative window
      await buffer.push('7890ab');
      expect(approvedTexts).toEqual(['1234567890']);
      expect(checkerMod.checkContentByPolicy).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '1234567890',
          partial: true,
          sessionId: expect.any(String)
        })
      );

      // 3. Flush remaining 2 chars ('ab') with full cumulative content and partial: false
      await buffer.flush();
      expect(approvedTexts).toEqual(['1234567890', 'ab']);
      expect(checkerMod.checkContentByPolicy).toHaveBeenLastCalledWith(
        expect.objectContaining({
          text: '1234567890ab',
          partial: false,
          sessionId: expect.any(String)
        })
      );
    });

    it('detects sensitive words split across chunk boundaries via cumulative windowing', async () => {
      const approvedTexts: string[] = [];
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(async ({ text }) => {
        if (text.includes('炸药')) {
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
        streamInterval: 4,
        isEnabled: true,
        policy: basePolicy,
        onApprovedText: (t) => approvedTexts.push(t)
      });

      // 第一块末端含“炸”（'安全测试炸' 的前 4 字为 '安全测试'，剩余 '炸' 在缓冲区）
      await buffer.push('123炸');
      expect(approvedTexts).toEqual(['123炸']);

      // 第二块首字为“药”，跨边界拼成“炸药”应被累积窗口检出并拦截
      await expect(buffer.push('药abc')).rejects.toThrow(
        new UserError(MODERATION_BLOCKED_ERROR_MESSAGE)
      );
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
      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
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

      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    });
  });

  describe('createLLMResponse output & reasoning moderation & usage preservation', () => {
    it('blocks non-stream toxic answer, suppresses onStreaming/onReasoning, and retains usage when throwError=false', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(async ({ text }) => {
        if (text === 'toxic answer') {
          return { action: ModerationActionEnum.block, isPass: false, text };
        }
        return { action: ModerationActionEnum.pass, isPass: true, text };
      });

      const createChatCompletionMod =
        await import('../../../../core/ai/llm/request/createChatCompletion');
      vi.spyOn(createChatCompletionMod, 'createChatCompletion').mockResolvedValue({
        isStreamResponse: false,
        requestMeta: { usedUserOpenAIKey: false },
        response: {
          id: 'test',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'toxic answer',
                reasoning_content: 'unmoderated thought'
              }
            }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        } as any
      });

      const { createLLMResponse } =
        await import('../../../../core/ai/llm/request/createLLMResponse');
      const onStreaming = vi.fn();
      const onReasoning = vi.fn();
      const modelItem = {
        model: 'gpt-4o',
        name: 'GPT-4o',
        config: { reasoning: false }
      } as any;
      const result = await createLLMResponse({
        throwError: false,
        modelData: modelItem,
        body: {
          model: modelItem,
          messages: [{ role: 'user', content: 'hello' }]
        } as any,
        onStreaming,
        onReasoning
      });

      expect(onStreaming).not.toHaveBeenCalled();
      expect(onReasoning).not.toHaveBeenCalled();
      expect(result.answerText).toBe('');
      expect(result.reasoningText).toBe('');
      expect(result.error).toBeInstanceOf(UserError);
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(5);
    });

    it('blocks non-stream toxic reasoning, suppresses callbacks, and retains usage when throwError=false', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(async ({ text }) => {
        if (text === 'toxic thought') {
          return { action: ModerationActionEnum.block, isPass: false, text };
        }
        return { action: ModerationActionEnum.pass, isPass: true, text };
      });

      const createChatCompletionMod =
        await import('../../../../core/ai/llm/request/createChatCompletion');
      vi.spyOn(createChatCompletionMod, 'createChatCompletion').mockResolvedValue({
        isStreamResponse: false,
        requestMeta: { usedUserOpenAIKey: false },
        response: {
          id: 'test',
          choices: [
            {
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: 'safe answer',
                reasoning_content: 'toxic thought'
              }
            }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 }
        } as any
      });

      const { createLLMResponse } =
        await import('../../../../core/ai/llm/request/createLLMResponse');
      const onStreaming = vi.fn();
      const onReasoning = vi.fn();
      const modelItem = {
        model: 'gpt-4o',
        name: 'GPT-4o',
        config: { reasoning: true }
      } as any;
      const result = await createLLMResponse({
        throwError: false,
        modelData: modelItem,
        body: {
          model: modelItem,
          messages: [{ role: 'user', content: 'hello' }]
        } as any,
        onStreaming,
        onReasoning
      });

      expect(onStreaming).not.toHaveBeenCalled();
      expect(onReasoning).not.toHaveBeenCalled();
      expect(result.answerText).toBe('');
      expect(result.reasoningText).toBe('');
      expect(result.error).toBeInstanceOf(UserError);
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(8);
    });

    it('masks toxic tool parameters without failing LLM response, suppresses onToolCall for blocked call, and retains usage', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(async ({ text }) => {
        if (text.includes('toxic param')) {
          return { action: ModerationActionEnum.replace, isPass: false, text };
        }
        return { action: ModerationActionEnum.pass, isPass: true, text };
      });

      const createChatCompletionMod =
        await import('../../../../core/ai/llm/request/createChatCompletion');
      vi.spyOn(createChatCompletionMod, 'createChatCompletion').mockResolvedValue({
        isStreamResponse: false,
        requestMeta: { usedUserOpenAIKey: false },
        response: {
          id: 'test',
          choices: [
            {
              finish_reason: 'tool_calls',
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: {
                      name: 'search',
                      arguments: JSON.stringify({ query: 'toxic param' })
                    }
                  }
                ]
              }
            }
          ],
          usage: { prompt_tokens: 15, completion_tokens: 12, total_tokens: 27 }
        } as any
      });

      const { createLLMResponse } =
        await import('../../../../core/ai/llm/request/createLLMResponse');
      const onToolCall = vi.fn();
      const modelItem = {
        model: 'gpt-4o',
        name: 'GPT-4o',
        config: { reasoning: false }
      } as any;
      const result = await createLLMResponse({
        throwError: false,
        modelData: modelItem,
        body: {
          model: modelItem,
          messages: [{ role: 'user', content: 'search' }],
          tools: [{ type: 'function', function: { name: 'search', parameters: {} } }]
        } as any,
        onToolCall
      });

      expect(onToolCall).not.toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.moderatedToolCallIds).toEqual(['call_1']);
      expect(result.toolCalls).toEqual([
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{}'
          }
        }
      ]);
      expect(result.usage.inputTokens).toBe(15);
      expect(result.usage.outputTokens).toBe(12);
    });
  });
});
