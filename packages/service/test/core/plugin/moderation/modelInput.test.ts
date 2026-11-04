import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MODERATION_BLOCKED_REPLACE_TEXT,
  ModerationActionEnum,
  ModerationExceptionActionEnum,
  ModerationRiskActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type { SystemModerationPolicyType } from '@fastgpt/global/core/plugin/moderation/type';
import * as checkerMod from '../../../../core/plugin/moderation/checker';
import * as serviceMod from '../../../../core/plugin/moderation/service';
import {
  checkFileContentModeration,
  checkModelPromptAndInput,
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

  describe('checkModelPromptAndInput', () => {
    it('passes all inputs when moderation passes', async () => {
      const checkerSpy = vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.pass,
        isPass: true,
        text: 'safe text'
      });

      const res = await checkModelPromptAndInput({
        userChatInput: 'what is FastGPT?',
        systemPrompt: 'You are an AI assistant',
        datasetCitePrompt: 'FastGPT is an AI agent platform'
      });

      expect(res.isUserChatInputBlocked).toBe(false);
      expect(res.userChatInput).toBe('what is FastGPT?');
      expect(res.systemPrompt).toBe('You are an AI assistant');
      expect(res.datasetCitePrompt).toBe('FastGPT is an AI agent platform');
      expect(checkerSpy).toHaveBeenCalledTimes(3);
    });

    it('flags isUserChatInputBlocked and sanitizes user input when user question is blocked', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(async ({ targetField, text }) => {
        if (targetField === 'userChatInput') {
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

      const res = await checkModelPromptAndInput({
        userChatInput: 'illegal question',
        systemPrompt: 'You are an AI assistant'
      });

      expect(res.isUserChatInputBlocked).toBe(true);
      expect(res.userChatInput).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
      expect(res.systemPrompt).toBe('You are an AI assistant');
    });

    it('sanitizes system prompt with MODERATION_BLOCKED_REPLACE_TEXT when system prompt is blocked', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(async ({ targetField, text }) => {
        if (targetField === 'systemPrompt') {
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

      const res = await checkModelPromptAndInput({
        userChatInput: 'normal question',
        systemPrompt: 'toxic system prompt'
      });

      expect(res.isUserChatInputBlocked).toBe(false);
      expect(res.userChatInput).toBe('normal question');
      expect(res.systemPrompt).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
    });

    it('sanitizes dataset citation slice with MODERATION_BLOCKED_REPLACE_TEXT when citation is blocked', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(async ({ targetField, text }) => {
        if (targetField === 'datasetCite') {
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

      const res = await checkModelPromptAndInput({
        userChatInput: 'normal question',
        datasetCitePrompt: 'sensitive leaked doc content'
      });

      expect(res.isUserChatInputBlocked).toBe(false);
      expect(res.datasetCitePrompt).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
    });
  });

  describe('checkFileContentModeration', () => {
    it('returns original content when content passes', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.pass,
        isPass: true,
        text: 'safe file text'
      });

      const result = await checkFileContentModeration({
        content: 'safe file text',
        fileName: 'readme.txt'
      });

      expect(result).toBe('safe file text');
    });

    it('replaces content with MODERATION_BLOCKED_REPLACE_TEXT when file content is blocked', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.block,
        isPass: false,
        text: 'bad file content'
      });

      const result = await checkFileContentModeration({
        content: 'bad file content',
        fileName: 'secret.pdf'
      });

      expect(result).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
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
