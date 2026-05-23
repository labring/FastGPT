import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { SANDBOX_TOOLS } from '@fastgpt/global/core/ai/sandbox/tools';
import { getSandboxRuntimeProfile } from '@fastgpt/service/core/ai/sandbox/runtime/profile';

const {
  agentPromptMock,
  agentSubscribeMock,
  agentAbortMock,
  agentConstructorArgs,
  createPiAgentWorkflowRuntimeMock,
  normalizePiAgentMessagesMock,
  buildAgentToolsMock,
  createPiAgentToolEventHandlerMock,
  getSandboxClientMock,
  getAgentSkillInfosMock,
  injectAgentSkillFilesToSandboxMock,
  sandboxWriteFilesMock,
  sandboxClientExecMock,
  axiosGetMock,
  checkTeamSandboxPermissionMock
} = vi.hoisted(() => ({
  agentPromptMock: vi.fn(),
  agentSubscribeMock: vi.fn(),
  agentAbortMock: vi.fn(),
  agentConstructorArgs: [] as any[],
  createPiAgentWorkflowRuntimeMock: vi.fn(),
  normalizePiAgentMessagesMock: vi.fn(({ messages }) => messages),
  buildAgentToolsMock: vi.fn(async () => []),
  createPiAgentToolEventHandlerMock: vi.fn(() => vi.fn()),
  getSandboxClientMock: vi.fn(),
  getAgentSkillInfosMock: vi.fn(),
  injectAgentSkillFilesToSandboxMock: vi.fn(),
  sandboxWriteFilesMock: vi.fn(),
  sandboxClientExecMock: vi.fn(),
  axiosGetMock: vi.fn(),
  checkTeamSandboxPermissionMock: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: checkTeamSandboxPermissionMock
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

vi.mock('@fastgpt/service/core/ai/skill/runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/core/ai/skill/runtime')>();
  return {
    ...original,
    getAgentSkillInfos: getAgentSkillInfosMock,
    injectAgentSkillFilesToSandbox: injectAgentSkillFilesToSandboxMock
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/service/runtime', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/service/runtime')>();

  return {
    ...original,
    getSandboxClient: getSandboxClientMock
  };
});

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  const mockClient = {
    get: axiosGetMock
  };

  return {
    ...original,
    pickOutboundAxios: () => mockClient
  };
});

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

const getEditSkillsRootPath = () => getSandboxRuntimeProfile().skillsRootPath;

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
    (global as any).feConfigs = {
      ...(global as any).feConfigs,
      show_agent_sandbox: true
    };
    agentConstructorArgs.length = 0;
    checkTeamSandboxPermissionMock.mockResolvedValue(undefined);
    agentPromptMock.mockResolvedValue(undefined);
    sandboxWriteFilesMock.mockResolvedValue(undefined);
    sandboxClientExecMock.mockResolvedValue({
      exitCode: 0,
      stdout: '/workspace\n',
      stderr: ''
    });
    axiosGetMock.mockResolvedValue({
      data: new ArrayBuffer(1)
    });
    getSandboxClientMock.mockResolvedValue({
      provider: {
        writeFiles: sandboxWriteFilesMock
      },
      exec: sandboxClientExecMock,
      getSandboxId: () => 'sandbox_prepared'
    });
    getAgentSkillInfosMock.mockResolvedValue([
      {
        id: './skills/EditSkill-SKILL.md',
        name: 'Edit Skill',
        description: 'Edit skill description',
        directory: './skills/EditSkill',
        skillMdPath: './skills/EditSkill/SKILL.md'
      }
    ]);
    injectAgentSkillFilesToSandboxMock.mockResolvedValue([
      {
        id: './skills/Report-skill_1/SKILL.md',
        name: 'Report',
        description: 'Write reports',
        directory: './skills/Report-skill_1',
        skillMdPath: './skills/Report-skill_1/SKILL.md'
      }
    ]);
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
    expect(prompt).toContain('## 知识库');
    expect(prompt).toContain('<id>dataset_1</id>');
    expect(prompt).toContain('当前时间');
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

  it('injects sandbox input files before calling pi agent prompt', async () => {
    const { dispatchPiAgent } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent');
    const props = createProps();
    props.params.useAgentSandbox = true;
    let sandboxReadyBeforePrompt = false;
    agentPromptMock.mockImplementationOnce(async () => {
      sandboxReadyBeforePrompt = sandboxWriteFilesMock.mock.calls.length > 0;
    });

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
        resultPromise = dispatchPiAgent(props);
      }
    );
    await resultPromise!;

    expect(getSandboxClientMock).toHaveBeenCalledWith({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
    expect(sandboxReadyBeforePrompt).toBe(true);
    const writeFiles = sandboxWriteFilesMock.mock.calls[0][0];
    expect(writeFiles.map((file: { path: string }) => file.path)).toEqual([
      'user_files/current.pdf'
    ]);
    expect(agentConstructorArgs[0].initialState.systemPrompt).not.toContain('pwd: /workspace');
    expect(agentPromptMock.mock.calls[0][0]).toContain('当前 sandbox 工作目录: /workspace');
    expect(buildAgentToolsMock.mock.calls[0][0].ctx.sandboxClient).toBeDefined();
    expect('sandboxId' in buildAgentToolsMock.mock.calls[0][0].ctx).toBe(false);
  });

  it('starts sandbox and exposes sandbox tools when selected skills are injected', async () => {
    const { dispatchPiAgent } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent');
    const props = createProps();
    props.params.useAgentSandbox = false;
    props.params.skills = [{ skillId: 'skill_1' }];

    let resultPromise: Promise<any>;
    runWithContext(
      {
        queryUrlTypeMap: {
          '/current.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchPiAgent(props);
      }
    );
    await resultPromise!;

    expect(getSandboxClientMock).toHaveBeenCalledWith({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
    expect(injectAgentSkillFilesToSandboxMock).toHaveBeenCalledWith({
      sandbox: expect.any(Object),
      skillIds: ['skill_1'],
      teamId: 'team_1',
      workDirectory: '.'
    });
    expect(getAgentSkillInfosMock).not.toHaveBeenCalled();

    const completionToolNames = buildAgentToolsMock.mock.calls[0][0].ctx.completionTools.map(
      (tool: any) => tool.function.name
    );
    expect(completionToolNames).toEqual(
      expect.arrayContaining(SANDBOX_TOOLS.map((tool) => tool.function.name))
    );
    expect(buildAgentToolsMock.mock.calls[0][0].ctx.sandboxClient).toBeDefined();

    const prompt = agentPromptMock.mock.calls[0][0];
    expect(prompt).toContain('## 技能');
    expect(prompt).toContain('<name>Report</name>');
    expect(prompt).toContain('<path>./skills/Report-skill_1/SKILL.md</path>');
    expect(prompt).toContain('当前 sandbox 工作目录: /workspace');
    expect(agentConstructorArgs[0].initialState.systemPrompt).toContain('## 沙盒能力');
    expect(agentConstructorArgs[0].initialState.systemPrompt).toContain('sandbox_shell');
  });

  it('scans existing sandbox skill files for editSkillId without reinjecting packages', async () => {
    const { dispatchPiAgent } =
      await import('@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent');
    const props = createProps();
    props.params.useAgentSandbox = false;
    props.params.skills = [];
    props.params.editSkillId = 'edit_skill_1';

    let resultPromise: Promise<any>;
    runWithContext(
      {
        queryUrlTypeMap: {
          '/current.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchPiAgent(props);
      }
    );
    await resultPromise!;

    expect(getSandboxClientMock).toHaveBeenCalledWith({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
    expect(getAgentSkillInfosMock).toHaveBeenCalledWith({
      sandbox: expect.any(Object),
      workDirectory: getEditSkillsRootPath()
    });
    expect(injectAgentSkillFilesToSandboxMock).not.toHaveBeenCalled();

    const prompt = agentPromptMock.mock.calls[0][0];
    expect(prompt).toContain('## 技能');
    expect(prompt).toContain('<name>Edit Skill</name>');
    expect(prompt).toContain('<path>./skills/EditSkill/SKILL.md</path>');
  });
});
