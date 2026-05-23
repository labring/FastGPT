import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatFileTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { getSandboxRuntimeProfile } from '@fastgpt/service/core/ai/sandbox/runtime/profile';

const {
  runUnifiedAgentLoopMock,
  getSandboxClientMock,
  sandboxWriteFilesMock,
  sandboxClientExecMock,
  axiosGetMock,
  getAgentSkillInfosMock,
  injectAgentSkillFilesToSandboxMock,
  checkTeamSandboxPermissionMock
} = vi.hoisted(() => ({
  runUnifiedAgentLoopMock: vi.fn(),
  getSandboxClientMock: vi.fn(),
  sandboxWriteFilesMock: vi.fn(),
  sandboxClientExecMock: vi.fn(),
  axiosGetMock: vi.fn(),
  getAgentSkillInfosMock: vi.fn(),
  injectAgentSkillFilesToSandboxMock: vi.fn(),
  checkTeamSandboxPermissionMock: vi.fn()
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

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: checkTeamSandboxPermissionMock
}));

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

const getEditSkillsRootPath = () => getSandboxRuntimeProfile().skillsRootPath;

describe('dispatchRunAgent user context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkTeamSandboxPermissionMock.mockResolvedValue(undefined);
    (global as any).feConfigs = {
      ...(global as any).feConfigs,
      show_agent_sandbox: true
    };
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
        id: './SKILL.md',
        name: 'Edit Skill',
        description: 'Edit skill description',
        directory: '.',
        skillMdPath: './SKILL.md'
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
        content: expect.stringContaining('<id>history_human_1-0</id>')
      }),
      expect.objectContaining({
        role: 'user',
        content: expect.stringContaining('<id>current_ai_1-0</id>')
      })
    ]);
    expect(loopInput.messages[0].content).not.toContain('## 知识库');
    expect(loopInput.messages[0].content).not.toContain('## 背景信息');
    expect(loopInput.messages[1].content).toContain('## 知识库');
    expect(loopInput.messages[1].content).toContain('## 背景信息');
    expect(loopInput.messages[1].content).toContain('当前问题');
  });

  it('injects sandbox input files before starting the unified agent loop', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
    const props = createProps();
    props.params.useAgentSandbox = true;
    let sandboxReadyBeforeLoop = false;
    runUnifiedAgentLoopMock.mockImplementationOnce(async () => {
      sandboxReadyBeforeLoop = sandboxWriteFilesMock.mock.calls.length > 0;
      return {
        status: 'done',
        answerText: 'ok',
        completeMessages: [],
        assistantMessages: [],
        requestIds: []
      };
    });

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
        result = dispatchRunAgent(props);
      }
    );
    await result;

    expect(getSandboxClientMock).toHaveBeenCalledWith({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
    expect(sandboxReadyBeforeLoop).toBe(true);
    const writeFiles = sandboxWriteFilesMock.mock.calls[0][0];
    expect(writeFiles.map((file: { path: string }) => file.path)).toEqual([
      'user_files/current.pdf'
    ]);
    const loopInput = runUnifiedAgentLoopMock.mock.calls[0][0].input;
    expect(loopInput.systemPrompt).not.toContain('pwd: /workspace');
    expect(loopInput.messages.at(-1)?.content).toContain('当前 sandbox 工作目录: /workspace');
    const loopRuntime = runUnifiedAgentLoopMock.mock.calls[0][0].runtime;
    await loopRuntime.executeTool({
      messages: [],
      call: {
        id: 'call_shell',
        type: 'function',
        function: {
          name: 'sandbox_shell',
          arguments: '{"command":"ls"}'
        }
      }
    });
    expect(getSandboxClientMock).toHaveBeenLastCalledWith({
      appId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
    expect(getSandboxClientMock).toHaveBeenCalledTimes(1);
  });

  it('omits pwd reminder when sandbox pwd cannot be resolved', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
    const props = createProps();
    props.params.useAgentSandbox = true;
    sandboxClientExecMock.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: 'pwd failed'
    });

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
        result = dispatchRunAgent(props);
      }
    );
    await result;

    const loopInput = runUnifiedAgentLoopMock.mock.calls[0][0].input;
    expect(loopInput.messages.at(-1)?.content).not.toContain('当前 sandbox 工作目录');
  });

  it('scans edit skill infos without requiring selected skills', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
    const props = createProps();
    props.params.useAgentSandbox = false;
    props.params.skills = [];
    props.params.editSkillId = 'edit_skill_1';

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
        result = dispatchRunAgent(props);
      }
    );
    await result;

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

    const loopInput = runUnifiedAgentLoopMock.mock.calls[0][0].input;
    expect(loopInput.messages.at(-1)?.content).toContain('## 技能');
    expect(loopInput.messages.at(-1)?.content).toContain('<name>Edit Skill</name>');
    expect(loopInput.messages.at(-1)?.content).toContain('<path>./SKILL.md</path>');
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

  it('throws error and interrupts when checkTeamSandboxPermission fails', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
    const props = createProps();
    props.params.useAgentSandbox = true;
    checkTeamSandboxPermissionMock.mockRejectedValueOnce(new Error('no permission'));

    let promise: any;
    runWithContext(
      {
        queryUrlTypeMap: {
          '/old.pdf': ChatFileTypeEnum.file,
          '/current.pdf': ChatFileTypeEnum.file
        },
        mcpClientMemory: {}
      },
      () => {
        promise = dispatchRunAgent(props);
      }
    );
    const result = await promise;
    expect(result.error?.system_error_text).toBe(
      '当前应用未配置虚拟机，暂时无法使用相关功能，请联系管理员配置。'
    );
    expect(getSandboxClientMock).not.toHaveBeenCalled();
  });
});
