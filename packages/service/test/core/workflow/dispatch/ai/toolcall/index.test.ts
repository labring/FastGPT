import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { dispatchRunTools } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall';
import { checkTeamSandboxPermission } from '@fastgpt/service/support/permission/teamLimit';

const {
  getLLMModelMock,
  getSandboxClientMock,
  injectSandboxFilesMock,
  runToolCallMock,
  useToolMessagesMock,
  useToolNodeListMock
} = vi.hoisted(() => ({
  getLLMModelMock: vi.fn(),
  getSandboxClientMock: vi.fn(),
  injectSandboxFilesMock: vi.fn(),
  runToolCallMock: vi.fn(),
  useToolMessagesMock: vi.fn(),
  useToolNodeListMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: getLLMModelMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/toolcall/toolCall', () => ({
  runToolCall: runToolCallMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/toolcall/hooks/useToolMessages', () => ({
  useToolMessages: useToolMessagesMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/toolcall/hooks/useToolNodeList', () => ({
  useToolNodeList: useToolNodeListMock
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', () => ({
  getSandboxClient: getSandboxClientMock
}));

vi.mock('@fastgpt/service/core/ai/sandbox/toolCall', () => ({
  injectSandboxFiles: injectSandboxFilesMock
}));

const createProps = (overrides: Record<string, any> = {}) =>
  ({
    node: {
      nodeId: 'toolcall_node',
      flowNodeType: FlowNodeTypeEnum.toolCall,
      isEntry: true,
      inputs: [
        {
          key: NodeInputKeyEnum.fileUrlList,
          value: ''
        }
      ]
    },
    runtimeNodes: [],
    runtimeNodesMap: new Map(),
    runtimeEdges: [],
    histories: [
      {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'history question' } }]
      }
    ],
    requestOrigin: 'https://fastgpt.example.com',
    chatConfig: {
      fileSelectConfig: {
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
    externalProvider: {},
    responseChatItemId: 'response_1',
    uid: 'user_1',
    chatId: 'chat_1',
    stream: false,
    params: {
      model: 'gpt-5',
      systemPrompt: 'system prompt',
      userChatInput: 'current question',
      history: 6,
      fileUrlList: ['/restored-from-history.pdf'],
      aiChatVision: true,
      aiChatReasoning: true,
      isResponseAnswerText: true,
      useAgentSandbox: false
    },
    ...overrides
  }) as any;

describe('dispatchRunTools file context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(checkTeamSandboxPermission).mockResolvedValue(undefined);
    getLLMModelMock.mockReturnValue({
      model: 'gpt-5',
      name: 'GPT-5',
      defaultSystemChatPrompt: 'default system prompt',
      vision: true,
      reasoning: true,
      censor: false
    });
    useToolNodeListMock.mockReturnValue([]);
    useToolMessagesMock.mockResolvedValue({
      messages: [],
      allFiles: new Map(),
      currentInputFiles: []
    });
    getSandboxClientMock.mockResolvedValue({
      provider: {},
      exec: vi.fn()
    });
    runToolCallMock.mockResolvedValue({
      toolWorkflowInteractiveResponse: undefined,
      toolDispatchFlowResponses: [],
      toolCallInputTokens: 0,
      toolCallOutputTokens: 0,
      toolCallTotalPoints: 0,
      completeMessages: [],
      assistantResponses: [],
      finish_reason: 'stop',
      error: undefined,
      requestIds: []
    });
  });

  it('does not restore history files when the node has no selected file link input', async () => {
    await dispatchRunTools(createProps());

    expect(useToolMessagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileLinks: undefined
      })
    );
    expect(runToolCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          fileUrlList: undefined
        })
      })
    );
  });

  it('keeps file links when the node explicitly selects a file link input', async () => {
    await dispatchRunTools(
      createProps({
        node: {
          nodeId: 'toolcall_node',
          flowNodeType: FlowNodeTypeEnum.toolCall,
          isEntry: true,
          inputs: [
            {
              key: NodeInputKeyEnum.fileUrlList,
              value: '{{workflowStart.userFiles}}'
            }
          ]
        },
        params: {
          ...createProps().params,
          fileUrlList: ['/current.pdf']
        }
      })
    );

    expect(useToolMessagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fileLinks: ['/current.pdf']
      })
    );
    expect(runToolCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          fileUrlList: ['/current.pdf']
        })
      })
    );
  });

  it('should throw error when team has no permission', async () => {
    vi.mocked(checkTeamSandboxPermission).mockRejectedValue(new Error('no permission'));
    global.feConfigs = { show_agent_sandbox: true };

    const promise = dispatchRunTools(
      createProps({
        params: {
          ...createProps().params,
          useAgentSandbox: true
        }
      })
    );

    await expect(promise).rejects.toThrow(
      '当前应用未配置虚拟机，暂时无法使用相关功能，请联系管理员配置。'
    );
    expect(useToolMessagesMock).not.toHaveBeenCalled();
    expect(runToolCallMock).not.toHaveBeenCalled();
  });

  it('initializes sandbox client and injects input files before running toolcall', async () => {
    global.feConfigs = { show_agent_sandbox: true };
    const sandboxClient = {
      provider: {},
      exec: vi.fn()
    };
    getSandboxClientMock.mockResolvedValueOnce(sandboxClient);
    useToolMessagesMock.mockResolvedValueOnce({
      messages: [],
      allFiles: new Map(),
      currentInputFiles: [
        {
          id: 'file_1',
          name: 'a.pdf',
          url: 'https://files/a.pdf',
          sandboxPath: '/workspace/a.pdf'
        }
      ]
    });

    await dispatchRunTools(
      createProps({
        params: {
          ...createProps().params,
          useAgentSandbox: true
        }
      })
    );

    expect(checkTeamSandboxPermission).toHaveBeenCalledWith('team_1');
    expect(getSandboxClientMock).toHaveBeenCalledWith({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
    expect(injectSandboxFilesMock).toHaveBeenCalledWith({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1',
      files: [
        {
          path: '/workspace/a.pdf',
          url: 'https://files/a.pdf'
        }
      ]
    });
    expect(runToolCallMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sandboxClient
      })
    );
  });
});
