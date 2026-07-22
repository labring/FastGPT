import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum, ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { dispatchRunTools } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall';
import { checkTeamSandboxPermission } from '@fastgpt/service/support/permission/teamLimit';
import { createRuntimeNodeResponseSummary } from '@fastgpt/service/core/workflow/dispatch/utils';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { getErrText } from '@fastgpt/global/common/error/utils';

const {
  getLLMModelMock,
  getSandboxClientMock,
  runToolCallMock,
  useToolMessagesMock,
  useToolNodeListMock
} = vi.hoisted(() => ({
  getLLMModelMock: vi.fn(),
  getSandboxClientMock: vi.fn(),
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

vi.mock('@fastgpt/service/core/ai/sandbox/interface/toolCall', () => ({
  prepareSandboxToolRuntime: getSandboxClientMock
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
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
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
      currentInputFiles: []
    });
    getSandboxClientMock.mockResolvedValue({
      provider: {},
      exec: vi.fn()
    });
    runToolCallMock.mockResolvedValue({
      toolWorkflowInteractiveResponse: undefined,
      runtimeNodeResponseSummary: createRuntimeNodeResponseSummary(),
      runTimes: 0,
      toolTotalPoints: 0,
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
        fileLinks: undefined,
        parseHistoryFiles: false
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
        fileLinks: ['/current.pdf'],
        parseHistoryFiles: true
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

    await expect(promise).rejects.toMatchObject({
      message: SandboxErrEnum.agentSandboxPermissionDenied
    });
    await expect(promise.catch((error) => getErrText(error))).resolves.toBe(
      'common:code_error.sandbox_error.agent_sandbox_permission_denied'
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
      currentInputFiles: [
        {
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
      sourceType: createProps().runningAppInfo.sourceType,
      sourceId: createProps().runningAppInfo.sourceId,
      userId: 'user_1',
      chatId: 'chat_1',
      readInputFile: expect.any(Function),
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
