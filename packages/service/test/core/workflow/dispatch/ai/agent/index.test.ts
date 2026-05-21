import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';

const { runUnifiedAgentLoopMock } = vi.hoisted(() => ({
  runUnifiedAgentLoopMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/agentLoop', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/core/ai/llm/agentLoop')>();
  return {
    ...original,
    runUnifiedAgentLoop: runUnifiedAgentLoopMock
  };
});

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
        value: []
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

describe('dispatchRunAgent user context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runUnifiedAgentLoopMock.mockResolvedValue({
      status: 'done',
      answerText: 'ok',
      completeMessages: [],
      assistantMessages: [],
      requestIds: []
    });
  });

  it('passes rewritten history and current system-reminder into unified agent loop', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');

    let result: any;
    runWithContext(
      {
        queryUrlTypeMap: {
          '/old.pdf': ChatFileTypeEnum.file,
          '/current.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      () => {
        result = dispatchRunAgent(createProps());
      }
    );
    await result;

    const loopInput = runUnifiedAgentLoopMock.mock.calls[0][0].input;
    expect(loopInput.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('<id>history_ai_1-0</id>')
      }),
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('<id>current_ai_1-0</id>')
      })
    ]);
    expect(loopInput.messages[0].content).not.toContain('# Input datasets');
    expect(loopInput.messages[0].content).not.toContain('# Current time');
    expect(loopInput.messages[1].content).toContain('# Input datasets');
    expect(loopInput.messages[1].content).toContain('# Current time');
    expect(loopInput.messages[1].content).toContain('当前问题');
  });

  it('returns the final answer as assistant response', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');

    let resultPromise: Promise<any>;
    runWithContext(
      {
        queryUrlTypeMap: {},
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(createProps());
      }
    );
    const result = await resultPromise!;

    expect(result.data.answerText).toBe('ok');
    expect(result[DispatchNodeResponseKeyEnum.assistantResponses]).toEqual([
      {
        text: {
          content: 'ok'
        }
      }
    ]);
  });

  it('keeps reasoning with hideReason when reasoning display is disabled', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
    const props = createProps();
    props.params.aiChatReasoning = false;
    runUnifiedAgentLoopMock.mockResolvedValueOnce({
      status: 'done',
      answerText: 'ok',
      reasoningText: 'hidden thinking',
      completeMessages: [],
      assistantMessages: [],
      requestIds: []
    });

    let resultPromise: Promise<any>;
    runWithContext(
      {
        queryUrlTypeMap: {},
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
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
          content: 'ok'
        }
      }
    ]);
  });
});
