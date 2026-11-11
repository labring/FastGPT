import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MODERATION_BLOCKED_ERROR_MESSAGE,
  MODERATION_BLOCKED_REPLACE_TEXT,
  ModerationActionEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import { NodeInputKeyEnum, NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import * as checkerMod from '../../../../../core/plugin/moderation/checker';
import { dispatchChatCompletion } from '../../../../../core/workflow/dispatch/ai/chat/dispatchChatCompletion';
import { dispatchRunTools } from '../../../../../core/workflow/dispatch/ai/toolcall';
import { dispatchRunAgent } from '../../../../../core/workflow/dispatch/ai/agent';
import { dispatchReadFiles } from '../../../../../core/workflow/dispatch/tools/readFiles';
import { createAgentLoopCoreToolRuntime } from '../../../../../core/workflow/dispatch/ai/agentLoopCore/application/runtime/toolRuntime';
import { createAgentLoopCoreSystemTools } from '../../../../../core/workflow/dispatch/ai/agentLoopCore/application/runtime/systemTools';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { findFailedResponseNode } from '@fastgpt/global/core/chat/utils';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { callbackMap } from '../../../../../core/workflow/dispatch/constants';
import { runWorkflow } from '../../../../../core/workflow/dispatch/index';
import { WorkflowVariableState } from '../../../../../core/workflow/dispatch/utils/variables';
import * as serviceMod from '../../../../../core/plugin/moderation/service';

const { getLLMModelDataMock, parseFileContentFromUrlsMock, getInputFilesMock } = vi.hoisted(() => ({
  getLLMModelDataMock: vi.fn(),
  parseFileContentFromUrlsMock: vi.fn(),
  getInputFilesMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/resource/service', () => ({
  loadWorkflowModelResource: async () => getLLMModelDataMock()
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getModelHandle: async () => ({ getLLMModelData: getLLMModelDataMock })
}));

vi.mock('../../../../../core/chat/fileContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../../core/chat/fileContext')>();
  return {
    ...actual,
    parseFileContentFromUrls: (...args: Parameters<typeof actual.parseFileContentFromUrls>) =>
      parseFileContentFromUrlsMock(...args)
  };
});

vi.mock('../../../../../core/workflow/dispatch/ai/chat/fileContext', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../../../core/workflow/dispatch/ai/chat/fileContext')
    >();
  return {
    ...actual,
    getInputFiles: (...args: Parameters<typeof actual.getInputFiles>) => getInputFilesMock(...args)
  };
});

vi.mock('../../../../../core/workflow/utils/context', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../../../../core/workflow/utils/context')>();
  return {
    ...actual,
    getWorkflowFileMaxAmount: () => actual.getWorkflowFileContext()?.limits.maxFileAmount ?? 10
  };
});

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
        maxContext: 128000,
        defaultSystemChatPrompt: '',
        vision: false,
        reasoning: false
      }
    });
    parseFileContentFromUrlsMock.mockResolvedValue([]);
    getInputFilesMock.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('dispatchReadFiles standalone node', () => {
    it('does not run moderation or block parsed document text on ReadFiles node', async () => {
      const checkSpy = vi.spyOn(checkerMod, 'checkContentByPolicy');
      parseFileContentFromUrlsMock.mockResolvedValueOnce([
        {
          name: 'secret.txt',
          url: 'https://example.com/secret.txt',
          content: 'sensitive document body',
          success: true
        }
      ]);

      const res = await dispatchReadFiles({
        runningUserInfo: {
          teamId: 'team_1',
          tmbId: 'tmb_1',
          username: 'user',
          teamName: 'team',
          memberName: 'member',
          contact: ''
        },
        histories: [],
        node: {
          nodeId: 'node_read_files',
          name: 'Read Files',
          avatar: '',
          flowNodeType: FlowNodeTypeEnum.readFiles,
          showStatus: false,
          version: '4891',
          inputs: []
        },
        params: {
          [NodeInputKeyEnum.fileUrlList]: ['https://example.com/secret.txt']
        }
      } as any);

      expect(checkSpy).not.toHaveBeenCalled();
      expect(res.data?.[NodeOutputKeyEnum.text]).toContain('sensitive document body');
    });
  });

  describe('dispatchChatCompletion', () => {
    it('checks model context once, skips histories, and returns node error when userChatInput or systemPrompt is blocked', async () => {
      const checkSpy = vi
        .spyOn(checkerMod, 'checkContentByPolicy')
        .mockImplementation(async ({ targetField, text }) => {
          if (targetField === 'modelContext' && text.includes('toxic question')) {
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
        histories: [
          {
            obj: ChatRoleEnum.Human,
            value: [{ text: { content: 'historical_sensitive_msg' } }]
          },
          {
            obj: ChatRoleEnum.AI,
            value: [{ text: { content: 'historical_ai_reply' } }]
          }
        ]
      } as any);

      expect(checkSpy).toHaveBeenCalledTimes(1);
      expect(checkSpy.mock.calls[0]?.[0]?.text).toContain('You are helpful assistant');
      expect(checkSpy.mock.calls[0]?.[0]?.text).toContain('toxic question');
      expect(checkSpy.mock.calls[0]?.[0]?.text).not.toContain('historical_sensitive_msg');
      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    });

    it('halts and returns node error in a single check when citation (system or user role) is blocked', async () => {
      const checkSpy = vi
        .spyOn(checkerMod, 'checkContentByPolicy')
        .mockImplementation(async ({ targetField, text }) => {
          if (targetField === 'modelContext' && text.includes('toxic citation')) {
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

      const systemRoleRes = await dispatchChatCompletion({
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
          aiChatQuoteRole: 'system',
          quoteQA: [{ q: 'q1', a: 'toxic citation' }]
        },
        histories: []
      } as any);

      expect(checkSpy).toHaveBeenCalledTimes(1);
      expect(systemRoleRes.error?.[NodeOutputKeyEnum.errorText]).toBe(
        MODERATION_BLOCKED_ERROR_MESSAGE
      );

      checkSpy.mockClear();

      const userRoleRes = await dispatchChatCompletion({
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

      expect(checkSpy).toHaveBeenCalledTimes(1);
      expect(userRoleRes.error?.[NodeOutputKeyEnum.errorText]).toBe(
        MODERATION_BLOCKED_ERROR_MESSAGE
      );
    });

    it('halts and returns node error in a single context check when parsed document content is blocked', async () => {
      getInputFilesMock.mockResolvedValueOnce([
        {
          type: ChatFileTypeEnum.document,
          name: 'sensitive.pdf',
          url: 'https://example.com/sensitive.pdf'
        }
      ]);
      parseFileContentFromUrlsMock.mockResolvedValueOnce([
        {
          name: 'sensitive.pdf',
          url: 'https://example.com/sensitive.pdf',
          content: 'forbidden document payload',
          success: true
        }
      ]);

      const checkSpy = vi
        .spyOn(checkerMod, 'checkContentByPolicy')
        .mockImplementation(async ({ targetField, text }) => {
          if (targetField === 'modelContext' && text.includes('forbidden document payload')) {
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
          inputs: [
            {
              key: NodeInputKeyEnum.fileUrlList,
              value: ['https://example.com/sensitive.pdf']
            }
          ]
        },
        params: {
          modelId: 'gpt-4o',
          userChatInput: 'summarize this file',
          systemPrompt: 'You are helpful assistant',
          fileUrlList: ['https://example.com/sensitive.pdf']
        },
        histories: []
      } as any);

      expect(checkSpy).toHaveBeenCalledTimes(1);
      expect(checkSpy.mock.calls[0]?.[0]?.text).toContain('forbidden document payload');
      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    });
  });

  describe('dispatchRunTools', () => {
    it('halts and returns node error response when pre-loop model context is blocked', async () => {
      const checkSpy = vi
        .spyOn(checkerMod, 'checkContentByPolicy')
        .mockImplementation(async ({ targetField, text }) => {
          if (targetField === 'modelContext' && text.includes('toxic tool question')) {
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

      expect(checkSpy).toHaveBeenCalledTimes(1);
      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    });
  });

  describe('dispatchRunAgent', () => {
    it('halts and returns node error response when pre-loop model context is blocked', async () => {
      const checkSpy = vi
        .spyOn(checkerMod, 'checkContentByPolicy')
        .mockImplementation(async ({ targetField, text }) => {
          if (targetField === 'modelContext' && text.includes('toxic agent question')) {
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

      const res = await dispatchRunAgent({
        res: {} as any,
        stream: false,
        detail: false,
        timezone: 'Asia/Shanghai',
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
        externalProvider: {},
        nodeSummary: {
          mergeNodeSummary: vi.fn()
        },
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

      expect(checkSpy).toHaveBeenCalledTimes(1);
      expect(checkSpy.mock.calls[0]?.[0]?.text).toContain('Agent instructions');
      expect(checkSpy.mock.calls[0]?.[0]?.text).toContain('toxic agent question');
      expect(res.error?.[NodeOutputKeyEnum.errorText]).toBe(MODERATION_BLOCKED_ERROR_MESSAGE);
    });
  });

  describe('createAgentLoopCoreSystemTools built-in readFile & datasetSearch moderation', () => {
    it('masks entire built-in readFile and datasetSearch tool output without throwing or failing the node', async () => {
      vi.spyOn(checkerMod, 'checkContentByPolicy').mockResolvedValue({
        action: ModerationActionEnum.replace,
        isPass: false,
        text: 'blocked'
      });

      const systemTools = createAgentLoopCoreSystemTools(
        {
          planEnabled: false,
          askEnabled: false,
          readFile: {
            enabled: true,
            maxFileAmount: 5,
            execute: async () => ({
              response: '## doc1.txt\nclean\n\n## doc2.txt\nsensitive content',
              metadata: {
                id: 'rf_1',
                nodeId: 'rf_1',
                moduleType: FlowNodeTypeEnum.readFiles,
                moduleName: 'Read Files',
                readFilesResult: 'sensitive content'
              }
            })
          },
          datasetSearch: {
            enabled: true,
            execute: async () => ({
              response: 'quote 1: sensitive dataset quote',
              metadata: {
                id: 'ds_1',
                nodeId: 'ds_1',
                moduleType: FlowNodeTypeEnum.datasetSearchNode,
                moduleName: 'Dataset Search',
                quoteList: [{ id: '1', q: 'sensitive dataset quote', a: '' } as any]
              }
            })
          }
        },
        { teamId: 'team_1', appId: 'app_1', chatId: 'chat_1' }
      );

      const readRes = await systemTools.readFile?.execute({ fileIndexes: ['1', '2'] });
      expect(readRes?.response).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
      expect(readRes?.error).toBeUndefined();
      expect((readRes?.metadata as any)?.toolRes).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
      expect((readRes?.metadata as any)?.readFilesResult).toBeUndefined();

      const searchRes = await systemTools.datasetSearch?.execute({ queries: ['test'] });
      expect(searchRes?.response).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
      expect(searchRes?.error).toBeUndefined();
      expect((searchRes?.metadata as any)?.toolRes).toBe(MODERATION_BLOCKED_REPLACE_TEXT);
      expect((searchRes?.metadata as any)?.quoteList).toBeUndefined();
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
