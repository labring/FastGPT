import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';

const {
  agentPromptMock,
  agentSubscribeMock,
  agentAbortMock,
  agentConstructorArgs,
  createPiAgentWorkflowRuntimeMock,
  normalizePiAgentMessagesMock,
  buildAgentToolsMock,
  createPiAgentToolEventHandlerMock
} = vi.hoisted(() => ({
  agentPromptMock: vi.fn(),
  agentSubscribeMock: vi.fn(),
  agentAbortMock: vi.fn(),
  agentConstructorArgs: [] as any[],
  createPiAgentWorkflowRuntimeMock: vi.fn(),
  normalizePiAgentMessagesMock: vi.fn(({ messages }) => messages),
  buildAgentToolsMock: vi.fn(async () => []),
  createPiAgentToolEventHandlerMock: vi.fn(() => vi.fn())
}));

vi.mock('@mariozechner/pi-agent-core', () => ({
  Agent: vi.fn().mockImplementation(function (args) {
    agentConstructorArgs.push(args);
    return {
      state: {
        messages: [
          {
            role: 'assistant',
            content: 'saved message'
          }
        ],
        errorMessage: ''
      },
      prompt: agentPromptMock,
      subscribe: agentSubscribeMock,
      abort: agentAbortMock
    };
  })
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/adapter/runtime', () => ({
  createPiAgentWorkflowRuntime: createPiAgentWorkflowRuntimeMock,
  normalizePiAgentMessages: normalizePiAgentMessagesMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/toolAdapter', () => ({
  buildAgentTools: buildAgentToolsMock,
  createPiAgentToolEventHandler: createPiAgentToolEventHandlerMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool/utils', () => ({
  getAgentRuntimeTools: vi.fn(async () => [])
}));

vi.mock('@fastgpt/service/core/dataset/schema', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/core/dataset/schema')>();
  return {
    ...original,
    MongoDataset: {
      ...original.MongoDataset,
      find: vi.fn(() => ({
        lean: vi.fn(async () => [])
      }))
    }
  };
});

vi.mock('@fastgpt/service/core/dataset/utils', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/core/dataset/utils')>();
  return {
    ...original,
    filterDatasetsByTmbId: vi.fn(async ({ datasetIds }) => datasetIds)
  };
});

const createProps = () =>
  ({
    checkIsStopping: vi.fn(() => false),
    node: {
      nodeId: 'agent_node',
      flowNodeType: FlowNodeTypeEnum.agent,
      inputs: [
        {
          key: NodeInputKeyEnum.fileUrlList,
          value: ['/current.pdf']
        }
      ]
    },
    runtimeNodes: [],
    runtimeNodesMap: new Map(),
    runtimeEdges: [],
    lang: 'zh-CN',
    histories: [
      {
        dataId: 'history_human_1',
        obj: ChatRoleEnum.Human,
        value: runtimePrompt2ChatsValue({
          text: '上一轮问题',
          files: [
            {
              name: 'old.pdf',
              url: '/old.pdf',
              type: ChatFileTypeEnum.file
            }
          ]
        })
      },
      {
        dataId: 'history_ai_1',
        obj: ChatRoleEnum.AI,
        value: [],
        memories: {
          'piMessages-agent_node': [
            {
              role: 'assistant',
              content: 'previous pi message'
            }
          ]
        }
      }
    ],
    query: runtimePrompt2ChatsValue({
      text: '前端原始问题',
      files: [
        {
          name: 'current.pdf',
          url: '/current.pdf',
          type: ChatFileTypeEnum.file
        }
      ]
    }),
    requestOrigin: 'https://fastgpt.example.com',
    chatConfig: {
      fileSelectConfig: {
        canSelectFile: true,
        maxFiles: 20
      }
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
    externalProvider: {},
    usagePush: vi.fn(),
    mode: 'chat',
    chatId: 'chat_1',
    responseChatItemId: 'current_ai_1',
    timezone: 'Asia/Shanghai',
    stream: false,
    maxRunTimes: 10,
    workflowDispatchDeep: 0,
    workflowStreamResponse: vi.fn(),
    variableState: {
      get: vi.fn(),
      set: vi.fn(),
      getStoreValue: vi.fn(),
      getFileStoreValueByRuntimeUrl: vi.fn(),
      toRuntimeRecord: vi.fn(() => ({})),
      toStoreRecord: vi.fn(() => ({})),
      clone: vi.fn()
    },
    params: {
      model: 'gpt-5',
      systemPrompt: 'system prompt',
      userChatInput: '当前问题',
      history: 6,
      fileUrlList: ['/current.pdf'],
      agent_selectedTools: [],
      skills: [],
      agent_datasetParams: {
        datasets: [
          {
            datasetId: 'dataset_1',
            avatar: 'avatar',
            name: '产品知识库',
            vectorModel: {
              model: 'text-embedding-3-small'
            }
          }
        ]
      },
      useAgentSandbox: false
    }
  }) as any;

describe('dispatchPiAgent user context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentConstructorArgs.length = 0;
    agentPromptMock.mockResolvedValue(undefined);
    createPiAgentWorkflowRuntimeMock.mockReturnValue({
      onPayload: vi.fn(),
      handleAgentEvent: vi.fn(),
      appendChildNodeResponse: vi.fn(),
      getReasoningText: vi.fn(() => ''),
      getAnswerText: vi.fn(() => 'pi answer'),
      appendPendingAgentError: vi.fn()
    });
  });

  it('passes the full current system-reminder to agent.prompt', async () => {
    const { dispatchPiAgent } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent');

    let resultPromise: Promise<any>;
    runWithContext(
      {
        queryUrlTypeMap: {
          '/old.pdf': ChatFileTypeEnum.file,
          '/current.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchPiAgent(createProps());
      }
    );
    const result = await resultPromise!;

    const prompt = agentPromptMock.mock.calls[0][0];
    expect(prompt).toContain('<system-reminder>');
    expect(prompt).toContain('<id>current_ai_1-0</id>');
    expect(prompt).toContain('# Input datasets');
    expect(prompt).toContain('<id>dataset_1</id>');
    expect(prompt).toContain('# Current time');
    expect(prompt).toContain('当前问题');
    expect(prompt).not.toContain('history_ai_1-0');

    expect(agentConstructorArgs[0].initialState.systemPrompt).not.toContain('<preset_resources>');
    expect(normalizePiAgentMessagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'assistant',
            content: 'previous pi message'
          }
        ]
      })
    );
    expect(result.data.answerText).toBe('pi answer');
    expect(result[DispatchNodeResponseKeyEnum.assistantResponses]).toEqual([
      {
        text: {
          content: 'pi answer'
        }
      }
    ]);
  });

  it('keeps reasoning with hideReason when reasoning display is disabled', async () => {
    const { dispatchPiAgent } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent');
    const props = createProps();
    props.params.aiChatReasoning = false;
    createPiAgentWorkflowRuntimeMock.mockReturnValueOnce({
      onPayload: vi.fn(),
      handleAgentEvent: vi.fn(),
      appendChildNodeResponse: vi.fn(),
      getReasoningText: vi.fn(() => 'hidden thinking'),
      getAnswerText: vi.fn(() => 'pi answer'),
      appendPendingAgentError: vi.fn()
    });

    let resultPromise: Promise<any>;
    runWithContext(
      {
        queryUrlTypeMap: {},
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchPiAgent(props);
      }
    );
    const result = await resultPromise!;

    expect(result[DispatchNodeResponseKeyEnum.assistantResponses]).toEqual([
      {
        reasoning: {
          content: 'hidden thinking'
        },
        hideReason: true,
        text: {
          content: 'pi answer'
        }
      }
    ]);
  });
});
