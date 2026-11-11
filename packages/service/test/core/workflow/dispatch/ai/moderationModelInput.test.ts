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
import { findFailedResponseNode } from '@fastgpt/global/core/chat/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { callbackMap } from '../../../../../core/workflow/dispatch/constants';
import { runWorkflow } from '../../../../../core/workflow/dispatch/index';
import { WorkflowVariableState } from '../../../../../core/workflow/dispatch/utils/variables';
import * as serviceMod from '../../../../../core/plugin/moderation/service';

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

  describe('createAgentLoopCoreToolRuntime & tool sub-workflow moderation', () => {
    it('replaces tool response with MODERATION_BLOCKED_REPLACE_TEXT, sanitizes nodeResponse, and clears errorMessage without stopping agent execution', async () => {
      vi.spyOn(serviceMod, 'getModerationPolicy').mockResolvedValue({
        enabled: true,
        activePluginId: 'mod_1',
        hooks: { userInput: true, modelInput: true, finalOutput: true },
        strategy: {
          streamInterval: 50,
          suspectedRiskAction: 'blockAndLog' as any,
          serviceExceptionAction: 'pass' as any
        }
      });
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.replace,
        isPass: false,
        text: 'sensitive tool result'
      });

      let capturedCachedResult: any;
      const mockToolProvider = {
        buildRuntimeTools: () => [],
        getToolInfo: () => undefined,
        executeTool: vi.fn().mockResolvedValue({
          response: 'sensitive tool result',
          errorMessage: 'sensitive tool result',
          nodeResponse: {
            id: 'call_1',
            nodeId: 'call_1',
            moduleType: FlowNodeTypeEnum.tool,
            moduleName: 'Search Tool',
            toolRes: { rawSecret: 'sensitive tool result' },
            httpResult: { rawSecret: 'sensitive tool result' },
            errorText: 'sensitive tool result'
          },
          stop: false
        })
      };

      const toolRuntime = createAgentLoopCoreToolRuntime({
        toolProvider: mockToolProvider as any,
        onToolResult: ({ result }) => {
          capturedCachedResult = result;
        }
      });

      const result = await toolRuntime.executeTool({
        call: { id: 'call_1', type: 'function', function: { name: 'search', arguments: '{}' } },
        messages: []
      });

      expect(result.response).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
      expect(result.errorMessage).toBeUndefined();
      expect(result.stop).toBe(false);
      expect(capturedCachedResult?.nodeResponse?.toolRes).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
      expect(capturedCachedResult?.nodeResponse?.httpResult).toBeUndefined();
      expect(capturedCachedResult?.nodeResponse?.errorText).toBeUndefined();
    });

    it('masks child node moderation error and sensitive tool output inside runWorkflow(isToolCall=true) without producing failed response banner', async () => {
      vi.spyOn(serviceMod, 'getModerationPolicy').mockResolvedValue({
        enabled: true,
        activePluginId: 'mod_1',
        hooks: { userInput: true, modelInput: true, finalOutput: true },
        strategy: {
          streamInterval: 50,
          suspectedRiskAction: 'blockAndLog' as any,
          serviceExceptionAction: 'pass' as any
        }
      });
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockImplementation(async ({ text }) => {
        if (text.includes('raw_sensitive_http_body')) {
          return {
            action: ModerationActionEnum.replace,
            isPass: false,
            verdict: 'block',
            text
          };
        }
        return {
          action: ModerationActionEnum.pass,
          isPass: true,
          text
        };
      });

      const originalHttp = callbackMap[FlowNodeTypeEnum.httpRequest468];
      const originalAnswer = callbackMap[FlowNodeTypeEnum.answerNode];
      try {
        callbackMap[FlowNodeTypeEnum.httpRequest468] = vi.fn(async () => ({
          data: { httpRawResponse: 'raw_sensitive_http_body' },
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            httpResult: { secret: 'raw_sensitive_http_body' }
          },
          [DispatchNodeResponseKeyEnum.toolResponse]: { secret: 'raw_sensitive_http_body' }
        }));

        const publishedHttpResponses: any[] = [];
        const variableState = await WorkflowVariableState.create({
          timezone: 'Asia/Shanghai',
          runningAppInfo: {
            sourceType: ChatSourceTypeEnum.app,
            sourceId: 'app_1',
            teamId: 'team_1',
            tmbId: 'tmb_1',
            name: 'App'
          },
          chatId: 'chat_1',
          responseChatItemId: 'resp_1',
          histories: [],
          uid: 'u_1',
          variablesConfig: [],
          inputVariables: {}
        });

        const httpWorkflowRes = await runWorkflow({
          mode: 'chat',
          timezone: 'Asia/Shanghai',
          runningAppInfo: {
            sourceType: ChatSourceTypeEnum.app,
            sourceId: 'app_1',
            teamId: 'team_1',
            tmbId: 'tmb_1',
            name: 'App'
          },
          runningUserInfo: {
            teamId: 'team_1',
            tmbId: 'tmb_1',
            username: 'user',
            teamName: 'team',
            memberName: 'member',
            contact: ''
          },
          histories: [],
          query: [],
          chatConfig: {},
          runtimeNodes: [
            {
              nodeId: 'http_tool_node',
              name: 'HTTP Tool',
              avatar: '',
              flowNodeType: FlowNodeTypeEnum.httpRequest468,
              isEntry: true,
              inputs: [],
              outputs: []
            } as any
          ],
          runtimeEdges: [],
          isToolCall: true,
          variableState,
          externalProvider: {},
          workflowDispatchDeep: 0,
          maxRunTimes: 10,
          checkIsStopping: () => false,
          nodeResponseSink: {
            hasOutput: true,
            publish: async (inputs) => {
              const items = inputs.map((i) => i.response);
              publishedHttpResponses.push(...items);
              return items;
            }
          }
        } as any);

        expect(httpWorkflowRes[DispatchNodeResponseKeyEnum.toolResponse]).toBe(
          MODERATION_BLOCKED_REPLACE_TEXT
        );
        expect(httpWorkflowRes.workflowRuntimeSummary.errorCount).toBe(0);
        expect(httpWorkflowRes.workflowRuntimeSummary.hasModerationBlock).toBe(true);
        expect(publishedHttpResponses).toHaveLength(1);
        expect(publishedHttpResponses[0].toolRes).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
        expect(publishedHttpResponses[0].httpResult).toBeUndefined();
        expect(findFailedResponseNode(publishedHttpResponses)).toBeUndefined();

        // Child node returning MODERATION_BLOCKED_ERROR_MESSAGE inside isToolCall=true
        callbackMap[FlowNodeTypeEnum.answerNode] = vi.fn(async () => ({
          error: { [NodeOutputKeyEnum.errorText]: MODERATION_BLOCKED_ERROR_MESSAGE },
          [DispatchNodeResponseKeyEnum.nodeResponse]: {
            error: MODERATION_BLOCKED_ERROR_MESSAGE,
            errorText: MODERATION_BLOCKED_ERROR_MESSAGE
          }
        }));

        const publishedAnswerResponses: any[] = [];
        const answerWorkflowRes = await runWorkflow({
          mode: 'chat',
          timezone: 'Asia/Shanghai',
          runningAppInfo: {
            sourceType: ChatSourceTypeEnum.app,
            sourceId: 'app_1',
            teamId: 'team_1',
            tmbId: 'tmb_1',
            name: 'App'
          },
          runningUserInfo: {
            teamId: 'team_1',
            tmbId: 'tmb_1',
            username: 'user',
            teamName: 'team',
            memberName: 'member',
            contact: ''
          },
          histories: [],
          query: [],
          chatConfig: {},
          runtimeNodes: [
            {
              nodeId: 'answer_tool_node',
              name: 'Answer Tool',
              avatar: '',
              flowNodeType: FlowNodeTypeEnum.answerNode,
              isEntry: true,
              inputs: [],
              outputs: []
            } as any
          ],
          runtimeEdges: [],
          isToolCall: true,
          variableState,
          externalProvider: {},
          workflowDispatchDeep: 0,
          maxRunTimes: 10,
          checkIsStopping: () => false,
          nodeResponseSink: {
            hasOutput: true,
            publish: async (inputs) => {
              const items = inputs.map((i) => i.response);
              publishedAnswerResponses.push(...items);
              return items;
            }
          }
        } as any);

        expect(answerWorkflowRes[DispatchNodeResponseKeyEnum.toolResponse]).toBe(
          MODERATION_BLOCKED_REPLACE_TEXT
        );
        expect(answerWorkflowRes.workflowRuntimeSummary.errorCount).toBe(0);
        expect(answerWorkflowRes.workflowRuntimeSummary.hasModerationBlock).toBe(true);
        expect(publishedAnswerResponses).toHaveLength(1);
        expect(publishedAnswerResponses[0].toolRes).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
        expect(publishedAnswerResponses[0].error).toBeUndefined();
        expect(publishedAnswerResponses[0].errorText).toBeUndefined();
        expect(findFailedResponseNode(publishedAnswerResponses)).toBeUndefined();
      } finally {
        callbackMap[FlowNodeTypeEnum.httpRequest468] = originalHttp;
        callbackMap[FlowNodeTypeEnum.answerNode] = originalAnswer;
      }
    });
  });
});
