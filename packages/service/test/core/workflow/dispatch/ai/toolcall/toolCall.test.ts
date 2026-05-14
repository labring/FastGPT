import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { runToolCall } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/toolCall';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { runAgentLoopMock, runWorkflowMock } = vi.hoisted(() => ({
  runAgentLoopMock: vi.fn(),
  runWorkflowMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/agentLoop', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/core/ai/llm/agentLoop')>();
  return {
    ...original,
    runAgentLoop: runAgentLoopMock
  };
});

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: runWorkflowMock
}));

const createProps = (overrides = {}) =>
  ({
    checkIsStopping: vi.fn(() => false),
    requestOrigin: 'https://fastgpt.example.com',
    runtimeNodes: [],
    runtimeNodesMap: new Map(),
    runtimeEdges: [],
    stream: false,
    retainDatasetCite: true,
    externalProvider: {},
    workflowStreamResponse: vi.fn(),
    usagePush: vi.fn(),
    node: {
      nodeId: 'toolcall_node',
      flowNodeType: FlowNodeTypeEnum.tools
    },
    runningAppInfo: {
      id: 'app_1',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      name: 'App'
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
    chatId: 'chat_1',
    chatConfig: {},
    params: {
      temperature: 0,
      maxToken: 1000,
      aiChatVision: false,
      aiChatReasoning: true,
      aiChatReasoningEffort: 'none',
      isResponseAnswerText: true,
      useAgentSandbox: false
    },
    messages: [
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'hello'
      }
    ],
    toolNodes: [],
    toolModel: {
      model: 'gpt-4',
      name: 'GPT-4'
    },
    allFiles: new Map(),
    currentInputFiles: [],
    ...overrides
  }) as any;

const createLoopResult = () => ({
  inputTokens: 10,
  outputTokens: 5,
  llmTotalPoints: 1,
  completeMessages: [
    {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: 'hello'
    },
    {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: 'answer'
    }
  ],
  assistantMessages: [
    {
      role: ChatCompletionRequestMessageRoleEnum.Assistant,
      content: 'answer'
    }
  ],
  interactiveResponse: undefined,
  finish_reason: 'stop',
  error: undefined,
  requestIds: ['req_main']
});

describe('runToolCall compression node responses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runWorkflowMock.mockResolvedValue({
      toolResponses: {
        result: 'search result'
      },
      assistantResponses: [],
      flowUsages: [],
      flowResponses: [
        {
          id: 'search',
          nodeId: 'search',
          moduleType: FlowNodeTypeEnum.tool,
          moduleName: 'Search'
        }
      ],
      workflowInteractiveResponse: undefined
    });
  });

  it('records context compression as ToolCall child node response and tool-response compression under the tool node', async () => {
    const contextCompressUsage = {
      moduleName: 'account_usage:compress_llm_messages',
      model: 'GPT-4',
      inputTokens: 20,
      outputTokens: 4,
      totalPoints: 0.2
    };
    const toolResponseCompressUsage = {
      moduleName: 'account_usage:tool_response_compress',
      model: 'GPT-4',
      inputTokens: 30,
      outputTokens: 6,
      totalPoints: 0.3
    };

    runAgentLoopMock.mockImplementation(async (options) => {
      const call = {
        id: 'call_search',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{}'
        }
      };

      options.onAfterCompressContext({
        usage: contextCompressUsage,
        requestIds: ['req_context_compress'],
        seconds: 0.12
      });
      await options.onRunTool({ call, messages: [] });
      options.onAfterToolResponseCompress({
        call,
        response: 'compressed tool response',
        usage: toolResponseCompressUsage,
        requestIds: ['req_tool_response_compress'],
        seconds: 0.34
      });
      options.onAfterToolCall({
        success: true,
        call,
        response: 'compressed tool response'
      });

      return createLoopResult();
    });
    const workflowStreamResponse = vi.fn();

    const result = await runToolCall(
      createProps({
        workflowStreamResponse,
        toolNodes: [
          {
            nodeId: 'search',
            name: 'Search',
            flowNodeType: FlowNodeTypeEnum.tool,
            avatar: 'tool-avatar',
            toolDescription: 'Search data',
            toolParams: []
          }
        ]
      })
    );
    const flowResponses = result.toolDispatchFlowResponses.flatMap((item) => item.flowResponses);

    expect(result.requestIds).toEqual(['req_main']);
    expect(flowResponses).toEqual([
      expect.objectContaining({
        id: 'toolcall_node-context-compress-req_context_compress',
        nodeId: 'toolcall_node-context-compress-req_context_compress',
        moduleName: 'chat:compress_llm_messages',
        moduleType: FlowNodeTypeEnum.tools,
        moduleLogo: 'core/app/agent/child/contextCompress',
        runningTime: 0.12,
        model: 'GPT-4',
        llmRequestIds: ['req_context_compress'],
        inputTokens: 20,
        outputTokens: 4,
        totalPoints: 0.2,
        compressTextAgent: {
          inputTokens: 20,
          outputTokens: 4,
          totalPoints: 0.2
        }
      }),
      expect.objectContaining({
        nodeId: 'search',
        childrenResponses: [
          expect.objectContaining({
            id: 'toolcall_node-tool-response-compress-call_search-req_tool_response_compress',
            nodeId: 'toolcall_node-tool-response-compress-call_search-req_tool_response_compress',
            moduleName: 'chat:tool_response_compress',
            moduleType: FlowNodeTypeEnum.tools,
            moduleLogo: 'core/app/agent/child/contextCompress',
            runningTime: 0.34,
            model: 'GPT-4',
            llmRequestIds: ['req_tool_response_compress'],
            inputTokens: 30,
            outputTokens: 6,
            totalPoints: 0.3,
            textOutput: 'compressed tool response',
            compressTextAgent: {
              inputTokens: 30,
              outputTokens: 6,
              totalPoints: 0.3
            }
          })
        ]
      })
    ]);
    expect(result.toolDispatchFlowResponses.map((item) => item.flowUsages)).toEqual([
      [contextCompressUsage],
      expect.arrayContaining([toolResponseCompressUsage])
    ]);
    expect(
      workflowStreamResponse.mock.calls.filter(
        ([event]) => event.event === 'toolResponse' && event.id === 'call_search'
      )
    ).toEqual([
      [
        expect.objectContaining({
          id: 'call_search',
          event: 'toolResponse',
          data: {
            tool: {
              id: 'call_search',
              toolName: '',
              toolAvatar: '',
              params: '',
              response: 'compressed tool response'
            }
          }
        })
      ]
    ]);
  });

  it('keeps compression child node responses when compression has no requestId', async () => {
    const usage = {
      moduleName: 'account_usage:compress_llm_messages',
      model: 'GPT-4',
      totalPoints: 0.1
    };

    runAgentLoopMock.mockImplementation(async (options) => {
      options.onAfterCompressContext({
        usage,
        requestIds: [],
        seconds: 0.1
      });

      return createLoopResult();
    });

    const result = await runToolCall(createProps());
    const [flowResponse] = result.toolDispatchFlowResponses.flatMap((item) => item.flowResponses);

    expect(result.requestIds).toEqual(['req_main']);
    expect(flowResponse).toEqual(
      expect.objectContaining({
        moduleName: 'chat:compress_llm_messages',
        llmRequestIds: undefined,
        totalPoints: 0.1,
        compressTextAgent: {
          inputTokens: 0,
          outputTokens: 0,
          totalPoints: 0.1
        }
      })
    );
  });
});
