import { runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { UserConfigError } from '@fastgpt/global/common/error/utils';
import { getRunningSandboxId } from '@fastgpt/service/core/ai/sandbox/utils/id';
import { getSandboxRuntimeProfile } from '@fastgpt/service/core/ai/sandbox/application/runtime';
import { createNodeSummary } from '@fastgpt/service/core/workflow/dispatch/utils/summary';
import { runWithTestWorkflowContext as runWithWorkflowContext } from '@fastgpt/service/test/core/workflow/dispatch/context/fixtures';
import { createTestWorkflowFileContext } from '@fastgpt/service/test/core/workflow/dispatch/context/fixtures';
import { runTestWorkflowDispatch } from '@fastgpt/service/test/core/workflow/dispatch/context/fixtures';
import { WorkflowMemoryContext } from '@fastgpt/service/core/workflow/dispatch/context/memory';
import { dispatchRunAgent as dispatchRunAgentWithoutContext } from '@fastgpt/service/core/workflow/dispatch/ai/agent';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let testFileContext: Awaited<ReturnType<typeof createTestWorkflowFileContext>>;

/** 单独运行 Agent 时从测试历史建立根记忆，依赖由夹具注入而不是夹带进节点 Props。 */
const dispatchRunAgent = (
  props: Parameters<typeof dispatchRunAgentWithoutContext>[0] & {
    memoryContext?: WorkflowMemoryContext;
  }
) =>
  runTestWorkflowDispatch(
    { ...props, memoryContext: WorkflowMemoryContext.fromWorkflow(props) },
    { dispatch: dispatchRunAgentWithoutContext }
  );

const runWithContext = <T>(
  value: Omit<Parameters<typeof runWithWorkflowContext>[0], 'fileContext'> & {
    fileContext?: Parameters<typeof runWithWorkflowContext>[0]['fileContext'];
  },
  fn: (ctx: Parameters<typeof runWithWorkflowContext>[0]) => T
): T =>
  runWithWorkflowContext(
    {
      checkIsStopping: () => false,
      ...value,
      fileContext: value.fileContext ?? testFileContext
    },
    fn
  );

const {
  runAgentLoopMock,
  serviceEnvMock,
  getSandboxClientMock,
  sandboxCreateDirectoriesMock,
  sandboxWriteFilesMock,
  sandboxGetFileInfoMock,
  sandboxClientExecMock,
  axiosGetMock,
  getAgentRuntimeToolsMock,
  getAgentSkillInfosMock,
  injectAgentSkillFilesToSandboxMock,
  checkTeamSandboxPermissionMock,
  ensureAppSandboxRuntimeReadyMock,
  markChatSandboxEnabledMock,
  authSkillByTmbIdMock,
  getLLMModelDataMock
} = vi.hoisted(() => ({
  runAgentLoopMock: vi.fn(),
  serviceEnvMock: {
    AGENT_ENGINE: 'fastAgent',
    AGENT_SANDBOX_PROVIDER: 'opensandbox',
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker',
    AGENT_SANDBOX_OPENSANDBOX_IMAGE: 'fastgpt-agent-sandbox:latest',
    AGENT_SANDBOX_MAX_SESSION_RUNTIME: 300,
    AGENT_SANDBOX_SEALOS_WORK_DIRECTORY: '/home/devbox/workspace',
    STREAM_RESUME_TTL_SECONDS: 300,
    STREAM_RESUME_POST_COMPLETE_TTL_SECONDS: 30,
    STREAM_RESUME_REDIS_MAXMEMORY_RATIO: 0.5,
    STREAM_RESUME_REDIS_MEMORY_CHECK_INTERVAL_MS: 5000
  },
  getSandboxClientMock: vi.fn(),
  sandboxCreateDirectoriesMock: vi.fn(),
  sandboxWriteFilesMock: vi.fn(),
  sandboxGetFileInfoMock: vi.fn(),
  sandboxClientExecMock: vi.fn(),
  axiosGetMock: vi.fn(),
  getAgentRuntimeToolsMock: vi.fn(),
  getAgentSkillInfosMock: vi.fn(),
  injectAgentSkillFilesToSandboxMock: vi.fn(),
  checkTeamSandboxPermissionMock: vi.fn(),
  ensureAppSandboxRuntimeReadyMock: vi.fn(),
  markChatSandboxEnabledMock: vi.fn(),
  authSkillByTmbIdMock: vi.fn(),
  getLLMModelDataMock: vi.fn()
}));

vi.mock('@fastgpt/service/support/permission/skill/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/support/permission/skill/auth')>()),
  authSkillByTmbId: authSkillByTmbIdMock
}));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  assertAuthModels: vi.fn(async () => ({ handle: {}, models: [] })),
  getAuthorizedModelIds: vi.fn(async () => new Set())
}));

vi.mock('@fastgpt/service/core/ai/model/catalog/service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()),
  getSystemModelHandle: async () => ({
    ...(await (
      await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()
    ).getSystemModelHandle()),
    getModelData: getLLMModelDataMock,
    getLLMModelData: getLLMModelDataMock
  }),
  getTeamModelHandle: async () => ({
    ...(await (
      await importOriginal<typeof import('@fastgpt/service/core/ai/model/catalog/service')>()
    ).getSystemModelHandle()),
    getModelData: getLLMModelDataMock,
    getLLMModelData: getLLMModelDataMock
  })
}));

vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: serviceEnvMock
}));

vi.mock('@fastgpt/service/core/ai/llm/agentLoop/interface', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/ai/llm/agentLoop/interface')>();
  return {
    ...original,
    runAgentLoop: runAgentLoopMock
  };
});

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/tool/utils', () => ({
  getAgentRuntimeTools: getAgentRuntimeToolsMock
}));

vi.mock('@fastgpt/service/core/ai/skill/runtime', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/core/ai/skill/runtime')>();
  return {
    ...original,
    getAgentSkillInfos: getAgentSkillInfosMock,
    injectAgentSkillFilesToSandbox: injectAgentSkillFilesToSandboxMock
  };
});

vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/application/runtime')>();

  return {
    ...original,
    prepareAgentSandboxRuntime: vi.fn(async (params) => ({
      sandboxClient: await getSandboxClientMock(params),
      workspaceRoot: original.getSandboxRuntimeProfile().workDirectory,
      workDirectory: original.getSandboxRuntimeProfile().workDirectory
    }))
  };
});
vi.mock('@fastgpt/service/core/ai/sandbox/application/runtime/upgrade', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('@fastgpt/service/core/ai/sandbox/application/runtime/upgrade')
    >();

  return { ...original, ensureAppSandboxRuntimeReady: ensureAppSandboxRuntimeReadyMock };
});
vi.mock(
  '@fastgpt/service/core/ai/sandbox/application/runtime/skill/core',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('@fastgpt/service/core/ai/sandbox/application/runtime/skill/core')
      >();

    return {
      ...original,
      getAgentSkillInfos: getAgentSkillInfosMock,
      injectAgentSkillFilesToSandbox: injectAgentSkillFilesToSandboxMock
    };
  }
);

vi.mock('@fastgpt/service/support/permission/teamLimit', () => ({
  checkTeamSandboxPermission: checkTeamSandboxPermissionMock
}));
vi.mock('@fastgpt/service/core/chat/sandbox/service', () => ({
  markChatSandboxEnabled: markChatSandboxEnabledMock
}));

vi.mock('@fastgpt/service/common/api/axios', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/common/api/axios')>();
  const mockClient = {
    get: axiosGetMock
  };

  return {
    ...original,
    axios: mockClient
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

const getMessageTextForTest = (content: unknown) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => (item?.type === 'text' ? item.text : '')).join('');
  }
  return '';
};

const createProps = () =>
  ({
    node: {
      nodeId: 'agent_node',
      flowNodeType: FlowNodeTypeEnum.agent,
      inputs: [
        {
          key: NodeInputKeyEnum.fileUrlList,
          value: ['https://files.example.com/current.pdf']
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
              url: 'https://files.example.com/old.pdf',
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
          url: 'https://files.example.com/current.pdf',
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
    uid: 'user_1',
    externalProvider: {},
    nodeSummary: createNodeSummary(),
    usagePush: vi.fn(),
    mode: 'chat',
    chatId: 'chat_1',
    responseChatItemId: 'current_ai_1',
    timezone: 'Asia/Shanghai',
    stream: false,
    maxRunTimes: 10,
    workflowDispatchDeep: 0,
    workflowStreamResponse: vi.fn(),
    variableContext: {
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
      fileUrlList: ['https://files.example.com/current.pdf'],
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

const getSandboxWorkDirectory = () => getSandboxRuntimeProfile().workDirectory;

describe('dispatchRunAgent user context', () => {
  beforeEach(async () => {
    testFileContext = await createTestWorkflowFileContext();
    vi.clearAllMocks();
    getLLMModelDataMock.mockImplementation(({ modelId, model }) => ({
      modelId: modelId ?? '68ad85a7463006c963799a41',
      model: model ?? 'gpt-5',
      name: model ?? 'gpt-5',
      config: {
        maxContext: 128000,
        maxResponse: 8192,
        quoteMaxToken: 30000,
        vision: true,
        audio: true,
        video: true,
        reasoning: true
      }
    }));
    checkTeamSandboxPermissionMock.mockResolvedValue(undefined);
    ensureAppSandboxRuntimeReadyMock.mockResolvedValue(false);
    markChatSandboxEnabledMock.mockResolvedValue(undefined);
    serviceEnvMock.AGENT_ENGINE = 'fastAgent';
    (global as any).feConfigs = {
      ...(global as any).feConfigs,
      show_agent_sandbox: true
    };
    sandboxCreateDirectoriesMock.mockResolvedValue(undefined);
    sandboxWriteFilesMock.mockResolvedValue([]);
    sandboxGetFileInfoMock.mockResolvedValue(new Map());
    sandboxClientExecMock.mockResolvedValue({
      exitCode: 0,
      stdout: '/workspace\n',
      stderr: ''
    });
    axiosGetMock.mockResolvedValue({
      data: Readable.from([Buffer.from('a')]),
      headers: {}
    });
    getAgentRuntimeToolsMock.mockResolvedValue([]);
    getSandboxClientMock.mockResolvedValue({
      provider: {
        createDirectories: sandboxCreateDirectoriesMock,
        writeFiles: sandboxWriteFilesMock,
        getFileInfo: sandboxGetFileInfoMock,
        readFiles: vi.fn(async () => []),
        execute: sandboxClientExecMock
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
        skillId: 'skill_1',
        name: 'Report',
        description: 'Write reports',
        versionId: 'version_1',
        targetDir: './skills/Report-skill_1'
      }
    ]);
    runAgentLoopMock.mockResolvedValue({
      status: 'done',
      completeMessages: [],
      assistantMessages: [
        {
          role: 'assistant',
          content: 'ok'
        }
      ],
      requestIds: []
    });
  });

  it('passes rewritten history and current system-reminder into agent loop', async () => {
    let result: any;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),

        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        result = dispatchRunAgent(createProps());
      }
    );
    const output = await result;

    const loopInput = runAgentLoopMock.mock.calls[0][0].input;
    const historyText = getMessageTextForTest(loopInput.messages[0].content);
    const currentText = getMessageTextForTest(loopInput.messages[1].content);
    expect(loopInput.messages.map((message: any) => message.role)).toEqual(['user', 'user']);
    expect(historyText).toContain('<url>https://files.example.com/old.pdf</url>');
    expect(currentText).toContain('<url>https://files.example.com/current.pdf</url>');
    expect(historyText).not.toContain('<id>');
    expect(currentText).not.toContain('<id>current_ai_1-');
    expect(historyText).not.toContain('## 知识库');
    expect(historyText).not.toContain('## 背景信息');
    expect(currentText).toContain('## 知识库');
    expect(currentText).toContain('## 背景信息');
    expect(currentText).toContain('当前问题');
    expect(
      output[DispatchNodeResponseKeyEnum.assistantResponses].find(
        (value: any) => value.inputContext
      )?.inputContext.content
    ).toBe(loopInput.messages[1].content);
  });

  it('removes history files when the node file input is not bound', async () => {
    const props = createProps();
    props.node.inputs = [
      {
        key: NodeInputKeyEnum.fileUrlList,
        value: []
      }
    ];

    let result: any;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        result = dispatchRunAgent(props);
      }
    );
    await result;

    const loopInput = runAgentLoopMock.mock.calls[0][0].input;
    const historyText = getMessageTextForTest(loopInput.messages[0].content);
    const currentText = getMessageTextForTest(loopInput.messages[1].content);

    expect(historyText).toBe('上一轮问题');
    expect(historyText).not.toContain('https://files.example.com/old.pdf');
    expect(currentText).toContain('https://files.example.com/current.pdf');
  });

  it('resolves PromptEditor tool references before building the agent system prompt', async () => {
    getAgentRuntimeToolsMock.mockResolvedValueOnce([
      {
        type: 'tool',
        id: 'runtime_search',
        name: 'Search documentation',
        avatar: 'search.svg',
        params: {},
        promptReference: {
          id: 'mcp-app_1/search',
          name: 'Search documentation'
        },
        requestSchema: {
          type: 'function',
          function: {
            name: 'runtime_search',
            description: 'Search documentation',
            parameters: {
              type: 'object'
            }
          }
        }
      }
    ]);
    const props = createProps();
    props.params.systemPrompt = '优先使用 {{@mcp-app_1/search@}}';
    props.params.agent_selectedTools = [{ id: 'mcp-app_1/search', config: {} }];

    let resultPromise: Promise<any>;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    await resultPromise!;

    const systemPrompt = runAgentLoopMock.mock.calls[0][0].input.systemPrompt;
    expect(systemPrompt).toContain('{{Search documentation}}');
    expect(systemPrompt).not.toContain('{{@mcp-app_1/search@}}');
  });

  it('uses the default agent system prompt when the user prompt is omitted', async () => {
    const props = createProps();
    delete props.params.systemPrompt;

    let resultPromise: Promise<any>;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    const result = await resultPromise!;

    expect(result.error).toBeUndefined();
    const systemPrompt = runAgentLoopMock.mock.calls[0][0].input.systemPrompt;
    expect(systemPrompt).toContain('你是一个 Work Agent。');
    expect(systemPrompt).not.toContain('<user_system_prompt>');
  });

  it('injects sandbox input files before starting the agent loop', async () => {
    const props = createProps();
    props.params.useAgentSandbox = true;
    let sandboxReadyBeforeLoop = false;
    runAgentLoopMock.mockImplementationOnce(async () => {
      sandboxReadyBeforeLoop = sandboxWriteFilesMock.mock.calls.length > 0;
      expect(
        props.workflowStreamResponse.mock.calls
          .map(([event]: [{ event: string; data: { phase?: string } }]) => event)
          .filter((event: { event: string }) => event.event === 'sandboxStatus')
          .map((event: { data: { phase: string } }) => event.data.phase)
      ).toEqual(['lazyInit', 'ready']);
      return {
        status: 'done',
        completeMessages: [],
        assistantMessages: [
          {
            role: 'assistant',
            content: 'ok'
          }
        ],
        requestIds: []
      };
    });

    let result: any;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        result = dispatchRunAgent(props);
      }
    );
    await result;

    expect(getSandboxClientMock).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
    expect(sandboxReadyBeforeLoop).toBe(true);
    expect(sandboxCreateDirectoriesMock).toHaveBeenCalledWith(['/workspace/user_files']);
    const inputFilesWriteCallIndex = sandboxWriteFilesMock.mock.calls.findIndex(([files]) =>
      files.some((file: { path: string }) => file.path === '/workspace/user_files/current.pdf')
    );
    expect(inputFilesWriteCallIndex).toBeGreaterThanOrEqual(0);
    const inputFilesWrite = sandboxWriteFilesMock.mock.calls[inputFilesWriteCallIndex][0];
    expect(inputFilesWrite.map((file: { path: string }) => file.path)).toEqual([
      '/workspace/user_files/current.pdf'
    ]);
    expect(sandboxCreateDirectoriesMock.mock.invocationCallOrder[0]).toBeLessThan(
      sandboxWriteFilesMock.mock.invocationCallOrder[inputFilesWriteCallIndex]
    );
    const loopInput = runAgentLoopMock.mock.calls[0][0].input;
    expect(loopInput.systemPrompt).toContain('<sandbox_capability>');
    expect(loopInput.systemPrompt).toContain('</sandbox_capability>');
    expect(loopInput.systemPrompt).not.toContain('pwd: /workspace');
    expect(getMessageTextForTest(loopInput.messages.at(-1)?.content)).toContain(
      '当前沙盒的工作目录: /workspace'
    );
    const loopRuntime = runAgentLoopMock.mock.calls[0][0].runtime;
    expect(runAgentLoopMock.mock.calls[0][0].provider).toBe('fastAgent');
    const runtimeToolNames = loopRuntime.toolCatalog.runtimeTools.map(
      (tool: any) => tool.function.name
    );
    expect(runtimeToolNames.some((name: string) => name.startsWith('sandbox_'))).toBe(false);
    expect(loopRuntime.systemTools.sandbox).toMatchObject({
      enabled: true
    });
    const sandboxClient = await getSandboxClientMock.mock.results[0].value;
    expect(loopRuntime.systemTools.sandbox.client).toBe(sandboxClient);
    expect(getSandboxClientMock).toHaveBeenLastCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'app_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
    expect(getSandboxClientMock).toHaveBeenCalledTimes(1);
  });

  it('authorizes skills as the runtime member before sandbox injection without an App resource context', async () => {
    const skillId = '507f1f77bcf86cd799439011';
    const skill = { _id: skillId, name: 'Report' };
    authSkillByTmbIdMock.mockResolvedValueOnce({ skill });
    const props = createProps();
    props.params.useAgentSandbox = true;
    props.params.skills = [{ skillId, name: 'Report' }];
    props.runningAppInfo.tmbId = 'app_owner_tmb';
    props.runningUserInfo.tmbId = 'external_user_tmb';

    const result = await runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),

        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => dispatchRunAgent(props)
    );

    expect(result.error).toBeUndefined();
    expect(authSkillByTmbIdMock).toHaveBeenCalledWith({
      tmbId: 'external_user_tmb',
      skillId,
      per: ReadPermissionVal,
      isRoot: false
    });
    expect(injectAgentSkillFilesToSandboxMock).toHaveBeenCalledWith(
      expect.objectContaining({
        skills: [skill]
      })
    );
  });

  it('streams upgrading and continues the same workflow after silent App sandbox migration', async () => {
    const props = createProps();
    props.params.useAgentSandbox = true;
    ensureAppSandboxRuntimeReadyMock.mockImplementationOnce(async ({ onUpgrade }) => {
      onUpgrade?.();
      return true;
    });

    let resultPromise: Promise<any> | undefined;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),

        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    const result = await resultPromise!;

    expect(ensureAppSandboxRuntimeReadyMock).toHaveBeenCalledOnce();
    const sandboxStatusEvents = props.workflowStreamResponse.mock.calls
      .map(([event]: [{ event: string; data: unknown }]) => event)
      .filter((event: { event: string }) => event.event === 'sandboxStatus');
    expect(sandboxStatusEvents).toEqual(
      ['lazyInit', 'upgrading', 'lazyInit', 'ready'].map((phase) => ({
        event: 'sandboxStatus',
        data: {
          sandboxId: getRunningSandboxId({
            sourceType: ChatSourceTypeEnum.app,
            sourceId: 'app_1',
            userId: 'user_1'
          }),
          phase
        }
      }))
    );
    expect(getSandboxClientMock).toHaveBeenCalledOnce();
    expect(runAgentLoopMock).toHaveBeenCalledOnce();
    expect(result.error).toBeUndefined();
  });

  it('returns the concrete silent migration failure reason', async () => {
    const props = createProps();
    props.params.useAgentSandbox = true;
    ensureAppSandboxRuntimeReadyMock.mockRejectedValueOnce(new Error('archive upload failed'));

    let resultPromise: Promise<any> | undefined;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    const result = await resultPromise!;

    expect(getSandboxClientMock).not.toHaveBeenCalled();
    expect(runAgentLoopMock).not.toHaveBeenCalled();
    expect(
      props.workflowStreamResponse.mock.calls
        .map(([event]: [{ event: string; data: { phase?: string } }]) => event)
        .filter((event: { event: string }) => event.event === 'sandboxStatus')
        .map((event: { data: { phase: string } }) => event.data.phase)
    ).toEqual(['lazyInit']);
    expect(result.error?.system_error_text).toContain('archive upload failed');
  });

  it('scans edit skill infos without requiring selected skills', async () => {
    const props = createProps();
    props.params.useAgentSandbox = false;
    props.params.skills = [];
    props.params.editSkillId = 'edit_skill_1';
    props.runningAppInfo.sourceType = ChatSourceTypeEnum.skillEdit;
    props.runningAppInfo.sourceId = 'edit_skill_1';

    let result: any;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        result = dispatchRunAgent(props);
      }
    );
    await result;

    expect(getSandboxClientMock).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.skillEdit,
      sourceId: 'edit_skill_1',
      userId: 'user_1',
      chatId: 'chat_1'
    });
    expect(getAgentSkillInfosMock).toHaveBeenCalledWith({
      sandbox: expect.any(Object),
      skillDirectories: [getSandboxWorkDirectory()]
    });
    expect(injectAgentSkillFilesToSandboxMock).not.toHaveBeenCalled();

    const loopInput = runAgentLoopMock.mock.calls[0][0].input;
    const currentText = getMessageTextForTest(loopInput.messages.at(-1)?.content);
    expect(currentText).toContain('<available_skills>');
    expect(currentText).toContain('<name>Edit Skill</name>');
    expect(currentText).toContain('<location>./SKILL.md</location>');
  });

  it('returns the full process text across tool-calling turns without duplicating answer_delta', async () => {
    runAgentLoopMock.mockImplementationOnce(async ({ runtime }) => {
      runtime.emitEvent({
        type: 'answer_delta',
        text: '我先查询工具。'
      });
      return {
        status: 'done',
        completeMessages: [],
        assistantMessages: [
          {
            role: 'assistant',
            content: '我先查询工具。',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'search', arguments: '{}' }
              }
            ]
          },
          {
            role: 'tool',
            tool_call_id: 'call_1',
            content: 'result'
          },
          {
            role: 'assistant',
            content: 'ok'
          }
        ],
        requestIds: []
      };
    });

    let resultPromise: Promise<any>;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(createProps());
      }
    );
    const result = await resultPromise!;

    expect(result.data.answerText).toBe('我先查询工具。ok');
    expect(result[DispatchNodeResponseKeyEnum.toolResponse]).toBe('我先查询工具。ok');
    expect(
      result[DispatchNodeResponseKeyEnum.assistantResponses].filter(
        (value: any) => value.text || value.reasoning
      )
    ).toMatchObject([
      {
        text: {
          content: '我先查询工具。'
        }
      },
      {
        text: {
          content: 'ok'
        }
      }
    ]);
  });

  it.each([new UserConfigError('Invalid API key'), new Error(''), undefined])(
    'returns error output together with the original core exception: %j',
    async (error) => {
      runAgentLoopMock.mockResolvedValueOnce({
        status: 'error',
        error,
        completeMessages: [],
        assistantMessages: [],
        requestIds: [],
        finishReason: 'error',
        usages: []
      });

      let resultPromise: Promise<any>;
      runWithContext(
        {
          checkIsStopping: () => false,
          fileContext: await createTestWorkflowFileContext(),

          mcpClientMemory: {}
        },
        () => {
          resultPromise = dispatchRunAgent(createProps());
        }
      );
      const result = await resultPromise!;

      expect(Object.hasOwn(result, 'rawError')).toBe(true);
      expect(result.rawError).toBe(error);
      expect(result.error).toEqual({ system_error_text: error?.message ?? '' });
    }
  );

  it('suppresses stream output and visible assistantResponses when isResponseAnswerText is false while preserving ask and answerText', async () => {
    const props = createProps();
    props.params.isResponseAnswerText = false;
    const runAgent = async () => {
      let promise: Promise<any>;
      runWithContext({ mcpClientMemory: {} }, () => {
        promise = dispatchRunAgent(props);
      });
      return promise!;
    };

    runAgentLoopMock.mockImplementationOnce(async ({ runtime }) => {
      runtime.emitEvent({ type: 'reasoning_delta', text: 'hidden reasoning' });
      runtime.emitEvent({ type: 'answer_delta', text: 'hidden answer' });
      runtime.emitEvent({ type: 'plan_status', status: 'generating' });
      runtime.emitEvent({
        type: 'plan_operation',
        operation: 'set_plan',
        id: 'hidden-plan-call',
        params: '{}',
        success: true,
        message: 'Plan saved',
        plan: {
          planId: 'plan_hidden',
          name: 'Hidden Plan',
          steps: [{ id: 'step-1', name: 'Work', status: 'in_progress' }]
        }
      });
      return {
        status: 'paused',
        pause: {
          toolCallId: 'call_ask_hidden',
          interactive: {
            type: 'agentAsk',
            params: {
              toolCallId: 'call_ask_hidden',
              arguments: JSON.stringify({
                reason: 'Need user confirmation',
                blockerType: 'missing_required_input',
                questions: [
                  {
                    question: 'Continue?',
                    options: [
                      { summary: 'Yes', value: 'Yes' },
                      { summary: 'No', value: 'No' }
                    ]
                  }
                ]
              })
            }
          }
        },
        completeMessages: [],
        assistantMessages: [{ role: 'assistant', content: 'hidden answer' }],
        requestIds: []
      };
    });

    const result = await runAgent();

    expect(result[DispatchNodeResponseKeyEnum.interactive]).toEqual(
      expect.objectContaining({
        type: 'agentAsk',
        params: expect.objectContaining({ toolCallId: 'call_ask_hidden' })
      })
    );
    expect(result[DispatchNodeResponseKeyEnum.assistantResponses]).toBeUndefined();
    expect(result[DispatchNodeResponseKeyEnum.memories]?.['app:app_1:agent_node']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          obj: ChatRoleEnum.AI,
          value: expect.arrayContaining([
            expect.objectContaining({
              inputContext: expect.any(Object),
              plan: expect.objectContaining({ planId: 'plan_hidden' }),
              tools: expect.arrayContaining([
                expect.objectContaining({ id: 'hidden-plan-call', response: 'Plan saved' })
              ])
            })
          ])
        })
      ])
    );
    expect(
      props.workflowStreamResponse.mock.calls.some(([event]: [{ event: string }]) =>
        ['answer', 'toolCall', 'toolParams', 'toolResponse', 'planStatus', 'plan'].includes(
          event.event
        )
      )
    ).toBe(false);

    runAgentLoopMock.mockImplementationOnce(async ({ runtime }) => {
      runtime.emitEvent({ type: 'answer_delta', text: 'hidden answer' });
      return {
        status: 'done',
        completeMessages: [],
        assistantMessages: [{ role: 'assistant', content: 'hidden answer' }],
        requestIds: []
      };
    });
    const doneResult = await runAgent();
    expect(doneResult.data.answerText).toBe('hidden answer');
    expect(doneResult[DispatchNodeResponseKeyEnum.toolResponse]).toBe('hidden answer');
    expect(doneResult[DispatchNodeResponseKeyEnum.assistantResponses]).toBeUndefined();
  });

  it('does not append errorText to assistantResponses and marks master_agent_call errorCaptured when catchError is enabled on the node', async () => {
    const publishedResponses: any[] = [];
    const props = createProps();
    delete props.params.agent_datasetParams;
    props.node.catchError = true;
    props.nodeResponseParentId = 'workflow_agent_resp_id';
    const nodeResponseSink = {
      publish: vi.fn(async (inputs: Array<{ response: any; parentId?: string }>) => {
        publishedResponses.push(
          ...inputs.map((input) => ({
            ...input.response,
            ...(input.parentId ? { parentId: input.parentId } : {})
          }))
        );
        return inputs.map((input) => input.response);
      })
    };
    runAgentLoopMock.mockImplementationOnce(async ({ runtime }) => {
      runtime.emitEvent({
        type: 'llm_request_end',
        requestIndex: 1,
        modelName: 'gpt-5',
        requestId: 'req_failed',
        finishReason: 'error',
        error: new Error('LLM request failed'),
        usages: [],
        seconds: 0.2
      });
      return {
        status: 'error',
        error: { message: 'LLM request failed' },
        completeMessages: [],
        assistantMessages: [],
        requestIds: ['req_failed']
      };
    });

    let resultPromise: Promise<any>;
    runWithContext({ mcpClientMemory: {}, nodeResponseSink }, () => {
      resultPromise = dispatchRunAgent(props);
    });
    const result = await resultPromise!;

    expect(result.error?.system_error_text).toBe('LLM request failed');
    expect(result[DispatchNodeResponseKeyEnum.toolResponse]).toEqual({
      error: 'LLM request failed'
    });
    expect(
      result[DispatchNodeResponseKeyEnum.assistantResponses].filter(
        (item: any) => !item.inputContext
      )
    ).toEqual([]);
    expect(publishedResponses).toEqual([
      expect.objectContaining({
        moduleName: 'chat:master_agent_call',
        errorText: 'LLM request failed',
        errorCaptured: true,
        parentId: 'workflow_agent_resp_id'
      })
    ]);
    expect(props.nodeSummary).toMatchObject({
      errorCount: 0
    });
    expect(props.nodeSummary.errorText).toBeUndefined();
  });

  it('publishes Agent internal responses as current-layer top-level rows', async () => {
    const publishedResponses: any[] = [];
    const props = createProps();
    const nodeResponseSink = {
      publish: vi.fn(async (inputs: Array<{ response: any }>) => {
        publishedResponses.push(...inputs.map((input) => input.response));
        return inputs.map((input) => input.response);
      })
    };
    runAgentLoopMock.mockImplementationOnce(async ({ runtime }) => {
      runtime.emitEvent({
        type: 'llm_request_end',
        requestIndex: 1,
        modelName: 'GPT-4',
        requestId: 'req_agent',
        finishReason: 'stop',
        answerText: 'answer',
        usages: [],
        seconds: 0.1
      });
      return {
        status: 'done',
        completeMessages: [],
        assistantMessages: [],
        requestIds: []
      };
    });

    let resultPromise: Promise<any>;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {},
        nodeResponseSink
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    await resultPromise!;

    expect(publishedResponses).toHaveLength(1);
    expect(props).not.toHaveProperty('nodeResponseSink');
    expect(publishedResponses[0]).not.toHaveProperty('parentId');
  });

  it('routes pi engine through the unified runAgentLoop provider entry', async () => {
    serviceEnvMock.AGENT_ENGINE = 'piAgent';
    const props = createProps();
    runAgentLoopMock.mockResolvedValueOnce({
      status: 'done',
      providerState: {
        piMessages: [
          {
            role: 'assistant',
            content: 'saved pi message'
          }
        ]
      },
      completeMessages: [],
      assistantMessages: [
        {
          role: 'assistant',
          content: 'pi answer'
        }
      ],
      requestIds: []
    });

    let resultPromise: Promise<any>;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    const result = await resultPromise!;

    expect(runAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'piAgent'
      })
    );
    expect(runAgentLoopMock.mock.calls[0][0].input).not.toHaveProperty('providerState');
    expect(result.data.answerText).toBe('pi answer');
    expect(result[DispatchNodeResponseKeyEnum.memories]).toEqual({
      'app:app_1:agent_node': undefined
    });
  });

  it('restores the latest unfinished plan from full histories without memory', async () => {
    const props = createProps();
    props.histories[props.histories.length - 1].value.push({
      plan: {
        planId: 'plan_resume',
        name: 'Resume after failure',
        steps: [
          {
            id: 'step_resume',
            name: 'Continue unfinished work',
            status: 'in_progress'
          }
        ]
      }
    });
    runAgentLoopMock.mockResolvedValueOnce({
      status: 'done',
      completeMessages: [],
      assistantMessages: [{ role: 'assistant', content: 'continued' }],
      requestIds: []
    });

    let resultPromise: Promise<any>;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    const result = await resultPromise!;

    expect(result[DispatchNodeResponseKeyEnum.rewriteHistories]).toBeUndefined();
    expect(runAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          activePlan: {
            planId: 'plan_resume',
            name: 'Resume after failure',
            steps: [
              {
                id: 'step_resume',
                name: 'Continue unfinished work',
                status: 'in_progress'
              }
            ]
          }
        })
      })
    );
  });

  it('resumes a multi-question agentAsk with answers in form order', async () => {
    const props = createProps();
    props.lastInteractive = {
      type: 'agentAsk',

      params: {
        toolCallId: 'call_ask',
        arguments: JSON.stringify({
          reason: 'Need confirmation',
          blockerType: 'user_choice',
          questions: [
            {
              question: 'First?',
              options: [
                { summary: 'A', value: 'A' },
                { summary: 'B', value: 'B' }
              ]
            },
            {
              question: 'Second?',
              options: [
                { summary: 'C', value: 'C' },
                { summary: 'D', value: 'D' }
              ]
            }
          ]
        })
      }
    };
    props.histories.at(-1).value.push({
      modelResponseId: 'ask-response',
      toolCallIds: ['call_ask'],
      interactive: {
        ...props.lastInteractive,
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      }
    });
    props.query = runtimePrompt2ChatsValue({
      text: JSON.stringify({ answers: ['A', ''] })
    });
    props.histories[props.histories.length - 1].memories = {
      'agentLoopMemory-agent_node': {
        providerState: {
          pendingMainContext: {
            askToolCallId: 'call_ask',
            messages: []
          }
        }
      }
    };
    runAgentLoopMock.mockResolvedValueOnce({
      status: 'done',
      completeMessages: [],
      assistantMessages: [{ role: 'assistant', content: 'continued answer' }],
      requestIds: []
    });

    let resultPromise: Promise<any>;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    const result = await resultPromise!;

    expect(result[DispatchNodeResponseKeyEnum.rewriteHistories]).toEqual([]);
    expect(runAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'tool',
              tool_call_id: 'call_ask',
              content: '## First?\n\n回答：A\n\n## Second?\n\n回答：未回答'
            })
          ])
        })
      })
    );
  });

  it('saves and restores child fastAgent transcript via scoped memoryContext across ask_user pause and resume', async () => {
    const { WorkflowMemoryContext } =
      await import('@fastgpt/service/core/workflow/dispatch/context/memory');

    const askArguments = JSON.stringify({
      reason: '需要确认侧重点',
      blockerType: 'user_choice',
      questions: [
        {
          question: '请问侧重哪个方向？',
          options: [
            { summary: '功能定位', value: '功能定位' },
            { summary: '技术架构', value: '技术架构' }
          ]
        }
      ]
    });
    const askInteractive = {
      type: 'agentAsk' as const,
      params: {
        toolCallId: 'call_child_ask',
        arguments: askArguments
      }
    };
    const childPlan = {
      planId: 'plan_child_1',
      name: 'Child Subtask Plan',
      steps: [{ id: 'step_1', name: 'Analyze architecture', status: 'in_progress' as const }]
    };

    // Turn 1: 父 ToolCall 调用子 Agent，子 Agent 触发 ask_user 暂停
    const turn1Props = createProps();
    turn1Props.histories = [];
    turn1Props.params.userChatInput = '[SUBTASK_PAYLOAD_9527] 请处理子任务：介绍 FastGPT';
    turn1Props.memoryContext =
      WorkflowMemoryContext.fromWorkflow(turn1Props).fork('node:parent_toolcall');

    runAgentLoopMock.mockImplementationOnce(async ({ runtime }) => {
      runtime.emitEvent({
        type: 'answer_delta',
        text: '先确认一下方向。'
      });
      runtime.emitEvent({
        type: 'plan_operation',
        operation: 'set_plan',
        id: 'call_child_plan',
        params: '{"name":"Child Subtask Plan"}',
        success: true,
        message: 'Plan saved',
        plan: childPlan
      });
      runtime.emitEvent({
        type: 'tool_interactive',
        call: {
          id: 'call_child_ask',
          type: 'function',
          function: { name: 'ask_user', arguments: askArguments }
        },
        interactive: askInteractive
      });
      return {
        status: 'paused',
        pause: {
          toolCallId: 'call_child_ask',
          interactive: askInteractive
        },
        completeMessages: [],
        assistantMessages: [{ role: 'assistant', content: '先确认一下方向。' }],
        requestIds: ['req_child_1']
      };
    });

    const turn1Result = await runWithContext({ mcpClientMemory: {} }, () =>
      dispatchRunAgent(turn1Props)
    );
    const scopedMemoryKey = 'node:parent_toolcall/app:app_1:agent_node';
    expect(turn1Result[DispatchNodeResponseKeyEnum.interactive]).toEqual(askInteractive);
    expect(turn1Result[DispatchNodeResponseKeyEnum.memories]).toHaveProperty(scopedMemoryKey);

    // Turn 2: 父流程落库后将子 Agent 输出标为 displayOnly，通过 memoryContext 恢复子 Agent 自身 transcript
    const turn2Props = createProps();
    turn2Props.params.userChatInput = '[SUBTASK_PAYLOAD_9527] 请处理子任务：介绍 FastGPT';
    turn2Props.lastInteractive = askInteractive;
    turn2Props.query = runtimePrompt2ChatsValue({
      text: JSON.stringify({ answers: ['技术架构'] })
    });
    turn2Props.histories = [
      {
        dataId: 'parent_human_1',
        obj: ChatRoleEnum.Human,
        value: runtimePrompt2ChatsValue({ text: '父流程原始问题' })
      },
      {
        dataId: 'parent_ai_1',
        obj: ChatRoleEnum.AI,
        value: [
          {
            modelResponseId: 'parent_resp_1',
            toolCallIds: ['call_parent_tool'],
            tools: [
              {
                id: 'call_parent_tool',
                functionName: 'agent_node',
                toolName: 'Child Agent',
                toolAvatar: '',
                params: '{"system_userChatInput":"[SUBTASK_PAYLOAD_9527]"}',
                response: 'none'
              }
            ]
          },
          ...turn1Result[DispatchNodeResponseKeyEnum.assistantResponses].map((item: any) => ({
            ...item,
            displayOnly: true
          }))
        ],
        memories: turn1Result[DispatchNodeResponseKeyEnum.memories]
      }
    ];
    turn2Props.memoryContext = WorkflowMemoryContext.fromWorkflow(turn2Props).fork(
      'node:parent_toolcall',
      {
        history: 0,
        histories: turn2Props.histories,
        hasInteractiveResume: true
      }
    );

    runAgentLoopMock.mockResolvedValueOnce({
      status: 'done',
      completeMessages: [],
      assistantMessages: [{ role: 'assistant', content: '子任务完成：技术架构介绍' }],
      requestIds: ['req_child_2']
    });

    const turn2Result = await runWithContext({ mcpClientMemory: {} }, () =>
      dispatchRunAgent(turn2Props)
    );

    const turn2Input = runAgentLoopMock.mock.calls[1][0].input;
    expect(turn2Input.activePlan).toEqual(childPlan);
    expect(getMessageTextForTest(turn2Input.messages[0].content)).toContain(
      '[SUBTASK_PAYLOAD_9527] 请处理子任务：介绍 FastGPT'
    );
    expect(getMessageTextForTest(turn2Input.messages[0].content)).not.toContain('父流程原始问题');
    expect(turn2Input.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          tool_calls: expect.arrayContaining([
            expect.objectContaining({
              id: 'call_child_ask',
              function: expect.objectContaining({ name: 'ask_user' })
            })
          ])
        }),
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'call_child_ask',
          content: '## 请问侧重哪个方向？\n\n回答：技术架构'
        })
      ])
    );
    expect(turn2Result.data.answerText).toBe('先确认一下方向。子任务完成：技术架构介绍');
    expect(turn2Result[DispatchNodeResponseKeyEnum.toolResponse]).toBe(
      '先确认一下方向。子任务完成：技术架构介绍'
    );
    expect(
      turn2Result[DispatchNodeResponseKeyEnum.assistantResponses].filter((item: any) => item.text)
    ).toEqual([
      {
        text: {
          content: '子任务完成：技术架构介绍'
        }
      }
    ]);
    expect(turn2Result[DispatchNodeResponseKeyEnum.memories]).toEqual({
      [scopedMemoryKey]: undefined
    });
  });

  it('restores pi providerState from unified memory and resumes ask with user answer', async () => {
    serviceEnvMock.AGENT_ENGINE = 'piAgent';
    const props = createProps();
    props.lastInteractive = {
      type: 'agentAsk',

      params: {
        toolCallId: 'call_ask_1',
        arguments: JSON.stringify({
          reason: '',
          blockerType: 'user_choice',
          questions: [{ question: 'Need confirmation', options: [] }]
        })
      }
    };
    props.histories[props.histories.length - 1].memories = {
      'agentLoopMemory-agent_node': {
        providerState: {
          pendingMainContext: {
            askToolCallId: 'call_ask_1',
            activePlan: {
              planId: 'plan_1'
            },
            messages: [
              {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_ask_1',
                    type: 'function',
                    function: {
                      name: 'ask_user',
                      arguments: '{}'
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    };
    runAgentLoopMock.mockResolvedValueOnce({
      status: 'paused',
      pause: {
        toolCallId: 'call_ask_2',
        interactive: {
          type: 'agentAsk',
          params: {
            toolCallId: 'call_ask_2',
            arguments: JSON.stringify({
              reason: 'Need another confirmation',
              blockerType: 'missing_required_input',
              questions: [
                {
                  question: 'Confirm again?',
                  options: [
                    { summary: 'Yes', value: 'Yes' },
                    { summary: 'No', value: 'No' }
                  ]
                }
              ]
            })
          }
        }
      },
      providerState: {
        pendingMainContext: {
          activePlan: {
            planId: 'plan_1'
          },
          askToolCallId: 'call_ask_2',
          messages: [
            {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_ask_2',
                  type: 'function',
                  function: {
                    name: 'ask_user',
                    arguments: '{}'
                  }
                }
              ]
            }
          ]
        }
      },
      completeMessages: [
        {
          role: 'assistant',
          tool_calls: [
            {
              id: 'call_ask_2',
              type: 'function',
              function: {
                name: 'ask_user',
                arguments: JSON.stringify({
                  reason: 'Need another confirmation',
                  blockerType: 'missing_required_input',
                  questions: [
                    {
                      question: 'Confirm again?',
                      options: [
                        { summary: 'Yes', value: 'Yes' },
                        { summary: 'No', value: 'No' }
                      ]
                    }
                  ]
                })
              }
            }
          ]
        }
      ],
      assistantMessages: [],
      requestIds: []
    });

    let resultPromise: Promise<any>;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    const result = await resultPromise!;

    expect(runAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'piAgent',
        input: expect.objectContaining({
          userAnswer: '前端原始问题',
          providerState: expect.objectContaining({
            pendingMainContext: expect.objectContaining({
              activePlan: {
                planId: 'plan_1'
              },
              askToolCallId: 'call_ask_1'
            })
          })
        })
      })
    );
    expect(result[DispatchNodeResponseKeyEnum.memories]).toEqual({
      'app:app_1:agent_node': {
        providerState: {
          pendingMainContext: {
            activePlan: {
              planId: 'plan_1'
            },
            askToolCallId: 'call_ask_2',
            messages: [
              {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_ask_2',
                    type: 'function',
                    function: {
                      name: 'ask_user',
                      arguments: '{}'
                    }
                  }
                ]
              }
            ]
          }
        }
      }
    });
    expect(result[DispatchNodeResponseKeyEnum.interactive]).toEqual(
      expect.objectContaining({
        params: expect.objectContaining({ toolCallId: 'call_ask_2' })
      })
    );
  });

  it('resumes a nested Pi ask with history=0 using the parent workflow checkpoint', async () => {
    const { WorkflowMemoryContext } =
      await import('@fastgpt/service/core/workflow/dispatch/context/memory');
    serviceEnvMock.AGENT_ENGINE = 'piAgent';
    const props = createProps();
    props.params.history = 0;
    props.histories = [];
    props.lastInteractive = {
      type: 'agentAsk',
      entryNodeIds: [],
      memoryEdges: [],
      nodeOutputs: [],
      params: {
        toolCallId: 'nested_ask',
        arguments: JSON.stringify({
          reason: '',
          blockerType: 'user_choice',
          questions: [{ question: 'Continue?', options: [] }]
        })
      }
    };
    const providerState = {
      pendingMainContext: {
        askToolCallId: 'nested_ask',
        messages: [
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'nested_ask',
                type: 'function',
                function: { name: 'ask_user', arguments: '{}' }
              }
            ]
          }
        ]
      }
    };
    props.memoryContext = WorkflowMemoryContext.fromRecord(
      {
        'node:outer_agent/app:app_1:agent_node': { providerState }
      },
      { rootSource: { sourceType: ChatSourceTypeEnum.app, sourceId: 'parent-app' } }
    )
      .fork('node:outer_agent')
      .fork('app:app_1');

    await runWithContext(
      {
        checkIsStopping: () => false,
        fileContext: await createTestWorkflowFileContext(),
        mcpClientMemory: {}
      },
      () => dispatchRunAgent(props)
    );
    expect(runAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'piAgent',
        input: expect.objectContaining({ providerState, userAnswer: '前端原始问题' })
      })
    );
  });
  it('keeps reasoning with hideReason when reasoning display is disabled', async () => {
    const props = createProps();
    props.params.aiChatReasoning = false;
    runAgentLoopMock.mockResolvedValueOnce({
      status: 'done',
      completeMessages: [],
      assistantMessages: [
        {
          role: 'assistant',
          content: 'ok',
          reasoning_content: 'hidden thinking'
        }
      ],
      requestIds: []
    });

    let resultPromise: Promise<any>;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    const result = await resultPromise!;

    expect(
      result[DispatchNodeResponseKeyEnum.assistantResponses].filter(
        (value: any) => value.text || value.reasoning
      )
    ).toEqual([
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

  it.each([
    {
      name: 'the app disables sandbox',
      configure: (props: ReturnType<typeof createProps>) => {
        props.params.useAgentSandbox = false;
        props.params.skills = [{ skillId: 'skill_1', name: 'Report' }];
      }
    },
    {
      name: 'the system disables sandbox',
      configure: (props: ReturnType<typeof createProps>) => {
        props.params.useAgentSandbox = true;
        props.params.skills = [{ skillId: 'skill_1', name: 'Report' }];
        global.feConfigs = { ...global.feConfigs, show_agent_sandbox: false };
      }
    }
  ])('continues without sandbox or skills when $name', async ({ configure }) => {
    const props = createProps();
    configure(props);

    let promise: any;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        promise = dispatchRunAgent(props);
      }
    );
    const result = await promise;

    expect(result.error).toBeUndefined();
    expect(result.data.answerText).toBe('ok');
    expect(getSandboxClientMock).not.toHaveBeenCalled();
    expect(injectAgentSkillFilesToSandboxMock).not.toHaveBeenCalled();
    expect(runAgentLoopMock).toHaveBeenCalledOnce();

    const loopInput = runAgentLoopMock.mock.calls[0][0].input;
    expect(loopInput.systemPrompt).not.toContain('<sandbox_capability>');
    expect(getMessageTextForTest(loopInput.messages.at(-1)?.content)).not.toContain(
      '<available_skills>'
    );
    expect(runAgentLoopMock.mock.calls[0][0].runtime.systemTools.sandbox).toBeUndefined();
  });

  it('keeps Skill Edit sandbox dependency blocking when the system disables sandbox', async () => {
    const props = createProps();
    props.runningAppInfo.sourceType = ChatSourceTypeEnum.skillEdit;
    props.runningAppInfo.sourceId = 'skill_1';
    props.params.editSkillId = 'skill_1';
    global.feConfigs = { ...global.feConfigs, show_agent_sandbox: false };

    let promise: Promise<any>;
    runWithContext(
      {
        fileContext: await createTestWorkflowFileContext(),
        checkIsStopping: () => false,
        mcpClientMemory: {}
      },
      () => {
        promise = dispatchRunAgent(props);
      }
    );
    const result = await promise!;

    expect(result.error?.system_error_text).toBe(
      'common:code_error.sandbox_error.agent_sandbox_permission_denied'
    );
    expect(getSandboxClientMock).not.toHaveBeenCalled();
    expect(runAgentLoopMock).not.toHaveBeenCalled();
  });

  it('keeps internal steps flattened in Simple Mode (ChatAgent) while wrapping them under the Agent node in Workflow Mode', async () => {
    const emitStepAndFinish = async ({ runtime }: any) => {
      runtime.emitEvent({
        type: 'llm_request_end',
        requestIndex: 1,
        modelName: 'gpt-5',
        requestId: 'req_1',
        finishReason: 'stop',
        answerText: 'done answer',
        usages: [],
        seconds: 0.5
      });
      return {
        status: 'done',
        completeMessages: [],
        assistantMessages: [{ role: 'assistant', content: 'done answer' }],
        requestIds: ['req_1']
      };
    };

    // 1. Simple Mode (has agent_datasetParams): no parentId, no outer nodeResponse
    const simplePublished: Array<{ response: any; parentId?: string }> = [];
    const simpleProps = createProps();
    simpleProps.nodeResponseParentId = 'simple_agent_resp_id';
    const simpleSink = {
      publish: vi.fn(async (entries: Array<{ response: any; parentId?: string }>) => {
        simplePublished.push(...entries);
        return entries.map((entry: any) => entry.response);
      })
    };
    runAgentLoopMock.mockImplementationOnce(emitStepAndFinish);

    const simpleResult = await runWithContext(
      { mcpClientMemory: {}, nodeResponseSink: simpleSink },
      () => dispatchRunAgent(simpleProps)
    );
    expect(simplePublished).toHaveLength(1);
    expect(simplePublished[0].response.parentId).toBeUndefined();
    expect(simpleResult[DispatchNodeResponseKeyEnum.nodeResponse]).toBeUndefined();

    // 2. Workflow Mode (no agent_datasetParams, even when agent_datasetSelectList is configured): steps attach to nodeResponseParentId, returns outer nodeResponse
    const workflowPublished: Array<{ response: any; parentId?: string }> = [];
    const workflowProps = createProps();
    delete workflowProps.params.agent_datasetParams;
    workflowProps.params.agent_datasetSelectList = [
      {
        datasetId: 'dataset_1',
        avatar: 'avatar',
        name: '产品知识库',
        vectorModel: {
          model: 'text-embedding-3-small'
        }
      }
    ];
    workflowProps.nodeResponseParentId = 'workflow_agent_resp_id';
    const workflowSink = {
      publish: vi.fn(async (entries: Array<{ response: any; parentId?: string }>) => {
        workflowPublished.push(...entries);
        return entries.map((entry: any) => entry.response);
      })
    };
    runAgentLoopMock.mockImplementationOnce(emitStepAndFinish);

    const workflowResult = await runWithContext(
      { mcpClientMemory: {}, nodeResponseSink: workflowSink },
      () => dispatchRunAgent(workflowProps)
    );
    expect(workflowPublished).toHaveLength(1);
    expect(workflowPublished[0].response.parentId).toBe('workflow_agent_resp_id');
    expect(workflowResult[DispatchNodeResponseKeyEnum.nodeResponse]).toEqual({
      model: 'gpt-5',
      query: '当前问题',
      textOutput: 'done answer',
      childResponseCount: 1
    });
  });

  it('reuses the parent conversation sandbox when running as a nested child agent', async () => {
    const props = createProps();
    props.params.useAgentSandbox = true;
    props.runningAppInfo = {
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'child_chat_agent_id',
      teamId: 'team_1',
      tmbId: 'tmb_1',
      name: 'Child ChatAgent',
      isChildApp: true
    };

    let promise: Promise<any>;
    runWithContext(
      {
        mcpClientMemory: {},
        sandboxContext: {
          sourceType: ChatSourceTypeEnum.app,
          sourceId: 'parent_app_id',
          teamId: 'team_1',
          userId: 'user_1',
          chatId: 'chat_1'
        }
      },
      () => {
        promise = dispatchRunAgent(props);
      }
    );
    const result = await promise!;

    expect(result.error).toBeUndefined();
    expect(getSandboxClientMock).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'parent_app_id',
      userId: 'user_1',
      chatId: 'chat_1'
    });
    expect(props.nodeSummary.hasAgentSandbox).toBe(true);
    expect(markChatSandboxEnabledMock).toHaveBeenCalledWith({
      sourceType: ChatSourceTypeEnum.app,
      sourceId: 'parent_app_id',
      chatId: 'chat_1',
      teamId: 'team_1'
    });
  });
});
