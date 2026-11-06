import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MODERATION_BLOCKED_ERROR_MESSAGE,
  MODERATION_BLOCKED_REPLACE_TEXT,
  ModerationActionEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import * as checkerMod from '../../../../../core/plugin/moderation/checker';
import { dispatchChatCompletion } from '../../../../../core/workflow/dispatch/ai/chat/dispatchChatCompletion';
import { dispatchRunTools } from '../../../../../core/workflow/dispatch/ai/toolcall';
import { dispatchRunAgent } from '../../../../../core/workflow/dispatch/ai/agent';
import { createAgentLoopCoreToolRuntime } from '../../../../../core/workflow/dispatch/ai/agentLoopCore/application/runtime/toolRuntime';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const { getLLMModelDataMock } = vi.hoisted(() => ({
  getLLMModelDataMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/resource/service', () => ({
  loadWorkflowModelResource: async () => getLLMModelDataMock()
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getModelHandle: async () => ({ getLLMModelData: getLLMModelDataMock })
}));

vi.mock('@fastgpt/service/common/string/tiktoken', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/common/string/tiktoken')>();
  return {
    ...actual,
    countGptMessagesTokens: vi.fn(async () => 100),
    countGptMessagesTokensBatch: vi.fn(async () => [100]),
    countPromptTokensBatch: vi.fn(async () => [100]),
    countPromptTokens: vi.fn(() => 100)
  };
});

describe('Model Input Guard node integration', () => {
  beforeEach(() => {
    getLLMModelDataMock.mockReturnValue({
      model: 'gpt-4o',
      name: 'GPT-4o',
      config: {
        defaultSystemChatPrompt: '',
        vision: false,
        reasoning: false
      }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('dispatchChatCompletion', () => {
    it('halts and returns node error response when user input is blocked', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(
        async ({ targetField, text }) => {
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
        }
      );

      const res = await dispatchChatCompletion({
        res: {} as any,
        stream: false,
        detail: false,
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
          nodeId: 'node_chat',
          name: 'AI Chat',
          avatar: '',
          flowNodeType: 'chatNode' as any,
          showStatus: true,
          inputs: []
        },
        params: {
          modelId: 'gpt-4o',
          userChatInput: 'toxic question',
          systemPrompt: 'You are helpful assistant'
        },
        histories: []
      } as any);

      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    });

    it('halts and returns node error response when citation in user role is blocked', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(
        async ({ targetField, text }) => {
          if (targetField === 'userChatInput' && text.includes('toxic citation')) {
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
        }
      );

      const res = await dispatchChatCompletion({
        res: {} as any,
        stream: false,
        detail: false,
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
          nodeId: 'node_chat',
          name: 'AI Chat',
          avatar: '',
          flowNodeType: 'chatNode' as any,
          showStatus: true,
          inputs: []
        },
        params: {
          modelId: 'gpt-4o',
          userChatInput: 'clean question',
          systemPrompt: 'You are helpful assistant',
          aiChatQuoteRole: 'user',
          quoteQA: [{ q: 'q1', a: 'toxic citation' }]
        },
        histories: []
      } as any);

      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    });
  });

  describe('dispatchRunTools', () => {
    it('halts and returns node error response when user input is blocked', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(
        async ({ targetField, text }) => {
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
        }
      );

      const res = await dispatchRunTools({
        res: {} as any,
        stream: false,
        detail: false,
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
          nodeId: 'node_toolcall',
          name: 'Tool Call',
          avatar: '',
          flowNodeType: 'toolCall' as any,
          showStatus: true,
          inputs: []
        },
        runtimeNodes: [],
        runtimeEdges: [],
        params: {
          modelId: 'gpt-4o',
          userChatInput: 'toxic tool question',
          systemPrompt: 'System instructions'
        },
        histories: []
      } as any);

      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    });
  });

  describe('dispatchRunAgent', () => {
    it('halts and returns node error response when user input is blocked', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(
        async ({ targetField, text }) => {
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
        }
      );

      const res = await dispatchRunAgent({
        res: {} as any,
        stream: false,
        detail: false,
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
          nodeId: 'node_agent',
          name: 'Agent',
          avatar: '',
          flowNodeType: 'agent' as any,
          showStatus: true,
          inputs: []
        },
        runtimeNodes: [],
        runtimeEdges: [],
        params: {
          modelId: 'gpt-4o',
          userChatInput: 'toxic agent question',
          systemPrompt: 'Agent instructions'
        },
        histories: []
      } as any);

      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    });
  });

  describe('createAgentLoopCoreToolRuntime (Loop internal tool results)', () => {
    it('replaces tool response with MODERATION_BLOCKED_REPLACE_TEXT without stopping agent execution', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.block,
        isPass: false,
        text: 'sensitive tool result'
      });

      const mockToolProvider = {
        buildRuntimeTools: () => [],
        getToolInfo: () => undefined,
        executeTool: vi.fn().mockResolvedValue({
          response: 'sensitive tool result',
          stop: false
        })
      };

      const toolRuntime = createAgentLoopCoreToolRuntime({
        toolProvider: mockToolProvider as any
      });

      const result = await toolRuntime.executeTool({
        call: { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
        messages: []
      });

      expect(result.response).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
      expect(result.stop).toBe(false);
    });
  });
});
