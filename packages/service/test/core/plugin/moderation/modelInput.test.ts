import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import {
  MODERATION_BLOCKED_ERROR_MESSAGE,
  MODERATION_BLOCKED_REPLACE_TEXT,
  MODERATION_ERROR_BLOCKED_MESSAGE,
  ModerationActionEnum,
  ModerationExceptionActionEnum,
  ModerationRiskActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type { SystemModerationPolicyType } from '@fastgpt/global/core/plugin/moderation/type';
import * as checkerMod from '../../../../core/plugin/moderation/checker';
import * as serviceMod from '../../../../core/plugin/moderation/service';
import {
  checkModelContextModeration,
  checkToolResultModeration
} from '../../../../core/plugin/moderation/modelInput';

describe('Model Input Guard (Anchor 2)', () => {
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
      streamInterval: 50,
      suspectedRiskAction: ModerationRiskActionEnum.blockAndLog,
      serviceExceptionAction: ModerationExceptionActionEnum.pass
    }
  };

  describe('checkModelContextModeration', () => {
    it('combines system prompt and current user message into a single check while skipping histories', async () => {
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.pass,
        isPass: true,
        text: 'safe text'
      });

      const res = await checkModelContextModeration({
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.System,
            content: 'You are an AI assistant.\nDataset quote: FastGPT docs'
          },
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'historical sensitive text that must be skipped'
          },
          {
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            content: 'historical assistant reply'
          },
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: [
              { type: 'text', text: 'Current user question' },
              { type: 'text', text: 'Parsed file content' }
            ]
          }
        ]
      });

      expect(res.isBlocked).toBe(false);
      expect(checkerSpy).toHaveBeenCalledTimes(1);
      const checkedText = checkerSpy.mock.calls[0][0].text;
      expect(checkedText).toContain('You are an AI assistant.');
      expect(checkedText).toContain('Dataset quote: FastGPT docs');
      expect(checkedText).toContain('Current user question');
      expect(checkedText).toContain('Parsed file content');
      expect(checkedText).not.toContain('historical sensitive text that must be skipped');
      expect(checkedText).not.toContain('historical assistant reply');
    });

    it('returns isBlocked: true and error message when combined context violates moderation', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.block,
        isPass: false,
        verdict: 'block',
        text: 'blocked'
      });

      const res = await checkModelContextModeration({
        systemPrompt: 'toxic system prompt',
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'normal question'
          }
        ]
      });

      expect(res).toEqual({
        isBlocked: true,
        blockErrorMessage: MODERATION_BLOCKED_ERROR_MESSAGE
      });
    });

    it('maps error verdict to MODERATION_ERROR_BLOCKED_MESSAGE when service exception policy blocks', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.block,
        isPass: false,
        verdict: 'error',
        text: 'error'
      });

      const res = await checkModelContextModeration({
        systemPrompt: 'any prompt'
      });

      expect(res).toEqual({
        isBlocked: true,
        blockErrorMessage: MODERATION_ERROR_BLOCKED_MESSAGE
      });
    });

    it('skips last user message when includeLastUserMessage is false (interactive resume)', async () => {
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.pass,
        isPass: true,
        text: 'safe'
      });

      await checkModelContextModeration({
        systemPrompt: 'Agent system prompt',
        includeLastUserMessage: false,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'previous turn user message'
          }
        ]
      });

      expect(checkerSpy).toHaveBeenCalledTimes(1);
      expect(checkerSpy.mock.calls[0][0].text).toBe('Agent system prompt');
    });
  });

  describe('checkToolResultModeration (Agent Loop Tool Result)', () => {
    it('returns original response when tool result passes', async () => {
      vi.spyOn(serviceMod, 'getModerationPolicy').mockResolvedValue(basePolicy);
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.pass,
        isPass: true,
        text: '{"weather": "sunny"}'
      });

      const result = await checkToolResultModeration({
        response: '{"weather": "sunny"}'
      });

      expect(result).toBe('{"weather": "sunny"}');
    });

    it('replaces tool response with MODERATION_BLOCKED_REPLACE_TEXT when tool result is blocked', async () => {
      vi.spyOn(serviceMod, 'getModerationPolicy').mockResolvedValue(basePolicy);
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.replace,
        isPass: false,
        text: 'toxic web search result'
      });

      const result = await checkToolResultModeration({
        response: 'toxic web search result'
      });

      expect(result).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
    });

    it('checks tool result under finalOutput stage when only finalOutput hook is enabled', async () => {
      vi.spyOn(serviceMod, 'getModerationPolicy').mockResolvedValue({
        ...basePolicy,
        hooks: {
          userInput: false,
          modelInput: false,
          finalOutput: true
        }
      });
      const checkSpy = vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.replace,
        isPass: false,
        text: 'sensitive tool output'
      });

      const result = await checkToolResultModeration({
        response: 'sensitive tool output'
      });

      expect(checkSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: ModerationStageEnum.output,
          targetField: 'toolResult',
          actionOnBlock: ModerationActionEnum.replace
        })
      );
      expect(result).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
    });
  });
});
