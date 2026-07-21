import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChatFileTypeEnum,
  ChatRoleEnum,
  ChatSourceTypeEnum
} from '@fastgpt/global/core/chat/constants';
import { runtimePrompt2ChatsValue } from '@fastgpt/global/core/chat/adapt';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { runWithContext } from '@fastgpt/service/core/workflow/utils/context';
import { getSandboxRuntimeProfile } from '@fastgpt/service/core/ai/sandbox/interface/runtime';
import { Readable } from 'node:stream';

const {
  runAgentLoopMock,
  serviceEnvMock,
  getSandboxClientMock,
  sandboxWriteFilesMock,
  sandboxClientExecMock,
  axiosGetMock,
  getAgentRuntimeToolsMock,
  getAgentSkillInfosMock,
  injectAgentSkillFilesToSandboxMock,
  checkTeamSandboxPermissionMock
} = vi.hoisted(() => ({
  runAgentLoopMock: vi.fn(),
  serviceEnvMock: {
    AGENT_ENGINE: 'fastAgent',
    AGENT_SANDBOX_PROVIDER: 'opensandbox',
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker',
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO: 'fastgpt-agent-sandbox',
    AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG: 'latest',
    AGENT_SANDBOX_MAX_EDIT_DEBUG: 100,
    AGENT_SANDBOX_MAX_SESSION_RUNTIME: 300,
    AGENT_SANDBOX_SEALOS_WORK_DIRECTORY: '/home/devbox/workspace'
  },
  getSandboxClientMock: vi.fn(),
  sandboxWriteFilesMock: vi.fn(),
  sandboxClientExecMock: vi.fn(),
  axiosGetMock: vi.fn(),
  getAgentRuntimeToolsMock: vi.fn(),
  getAgentSkillInfosMock: vi.fn(),
  injectAgentSkillFilesToSandboxMock: vi.fn(),
  checkTeamSandboxPermissionMock: vi.fn()
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

vi.mock('@fastgpt/service/core/ai/sandbox/interface/runtime', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/interface/runtime')>();

  return {
    ...original,
    prepareAgentSandboxRuntime: vi.fn(async (params) => {
      try {
        await checkTeamSandboxPermissionMock(params.teamId);
      } catch {
        throw original.createAgentSandboxPermissionDeniedError();
      }
      return {
        sandboxClient: await getSandboxClientMock(params),
        workDirectory: original.getSandboxRuntimeProfile().workDirectory
      };
    }),
    getAgentSkillInfos: getAgentSkillInfosMock,
    injectAgentSkillFilesToSandbox: injectAgentSkillFilesToSandboxMock
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
    axios: mockClient,
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

const getMessageTextForTest = (content: unknown) => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => (item?.type === 'text' ? item.text : '')).join('');
  }
  return '';
};

const createProps = () =>
  ({
    checkIsStopping: vi.fn(() => false),
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
  beforeEach(() => {
    vi.clearAllMocks();
    checkTeamSandboxPermissionMock.mockResolvedValue(undefined);
    serviceEnvMock.AGENT_ENGINE = 'fastAgent';
    (global as any).feConfigs = {
      ...(global as any).feConfigs,
      show_agent_sandbox: true
    };
    sandboxWriteFilesMock.mockResolvedValue([]);
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
        writeFiles: sandboxWriteFilesMock,
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
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');

    let result: any;
    runWithContext(
      {
        mcpClientMemory: {}
      },
      () => {
        result = dispatchRunAgent(createProps());
      }
    );
    await result;

    const loopInput = runAgentLoopMock.mock.calls[0][0].input;
    const historyText = getMessageTextForTest(loopInput.messages[0].content);
    const currentText = getMessageTextForTest(loopInput.messages[1].content);
    expect(loopInput.messages.map((message: any) => message.role)).toEqual(['user', 'user']);
    expect(historyText).toContain('<id>history_human_1-0</id>');
    expect(currentText).toContain('<id>current_ai_1-0</id>');
    expect(historyText).not.toContain('## 知识库');
    expect(historyText).not.toContain('## 背景信息');
    expect(currentText).toContain('## 知识库');
    expect(currentText).toContain('## 背景信息');
    expect(currentText).toContain('当前问题');
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

    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
    let resultPromise: Promise<any>;
    runWithContext(
      {
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

  it('uses an empty system prompt when the parameter is omitted', async () => {
    const props = createProps();
    delete props.params.systemPrompt;

    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
    let resultPromise: Promise<any>;
    runWithContext(
      {
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    const result = await resultPromise!;

    expect(result.error).toBeUndefined();
    expect(runAgentLoopMock.mock.calls[0][0].input.systemPrompt).toBe('');
  });

  it('injects sandbox input files before starting the agent loop', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
    const props = createProps();
    props.params.useAgentSandbox = true;
    let sandboxReadyBeforeLoop = false;
    runAgentLoopMock.mockImplementationOnce(async () => {
      sandboxReadyBeforeLoop = sandboxWriteFilesMock.mock.calls.length > 0;
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
      chatId: 'chat_1',
      teamId: 'team_1'
    });
    expect(sandboxReadyBeforeLoop).toBe(true);
    const writeFiles = sandboxWriteFilesMock.mock.calls[0][0];
    expect(writeFiles.map((file: { path: string }) => file.path)).toEqual([
      'user_files/current.pdf'
    ]);
    const loopInput = runAgentLoopMock.mock.calls[0][0].input;
    expect(loopInput.systemPrompt).not.toContain('pwd: /workspace');
    expect(getMessageTextForTest(loopInput.messages.at(-1)?.content)).toContain(
      '当前 sandbox 工作目录: /workspace'
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
      chatId: 'chat_1',
      teamId: 'team_1'
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
        mcpClientMemory: {}
      },
      () => {
        result = dispatchRunAgent(props);
      }
    );
    await result;

    const loopInput = runAgentLoopMock.mock.calls[0][0].input;
    expect(getMessageTextForTest(loopInput.messages.at(-1)?.content)).not.toContain(
      '当前 sandbox 工作目录'
    );
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
      chatId: 'chat_1',
      teamId: 'team_1'
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

  it('returns the final answer as assistant response', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');

    let resultPromise: Promise<any>;
    runWithContext(
      {
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

  it('does not duplicate final answer already persisted from answer_delta', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
    runAgentLoopMock.mockImplementationOnce(async ({ runtime }) => {
      runtime.emitEvent({
        type: 'answer_delta',
        text: 'ok'
      });
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

    let resultPromise: Promise<any>;
    runWithContext(
      {
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

  it('routes pi engine through the unified runAgentLoop provider entry', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
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
      'agentLoopMemory-agent_node': undefined
    });
  });

  it('restores the latest unfinished plan from full histories without memory', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
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
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    await resultPromise!;

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

  it('restores legacy fastAgent ask memory and resumes with the user answer', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
    const props = createProps();
    props.lastInteractive = {
      type: 'agentPlanAskQuery',
      askId: 'legacy-plan',
      params: {
        content: 'Need confirmation'
      }
    };
    props.histories[props.histories.length - 1].memories = {
      'agentLoopMemory-agent_node': {
        pendingMainContext: {
          askToolCallId: 'call_ask',
          messages: [
            {
              role: 'assistant',
              tool_calls: [
                {
                  id: 'call_ask',
                  type: 'function',
                  function: {
                    name: 'ask_agent',
                    arguments: '{}'
                  }
                }
              ]
            }
          ],
          activePlan: {
            planId: 'legacy-plan',
            task: 'Legacy plan',
            description: 'Legacy description',
            steps: [{ id: 'step_1', title: 'Legacy step', status: 'in_progress' }]
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
        mcpClientMemory: {}
      },
      () => {
        resultPromise = dispatchRunAgent(props);
      }
    );
    const result = await resultPromise!;

    expect(runAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'fastAgent',
        input: expect.objectContaining({
          userAnswer: '前端原始问题',
          providerState: {
            pendingMainContext: expect.objectContaining({
              askToolCallId: 'call_ask',
              activePlan: {
                planId: 'legacy-plan',
                name: 'Legacy plan',
                description: 'Legacy description',
                steps: [{ id: 'step_1', name: 'Legacy step', status: 'in_progress' }]
              }
            })
          }
        })
      })
    );
    expect(result.data.answerText).toBe('continued answer');
  });

  it('restores pi providerState from unified memory and resumes ask with user answer', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
    serviceEnvMock.AGENT_ENGINE = 'piAgent';
    const props = createProps();
    props.lastInteractive = {
      type: 'agentPlanAskQuery',
      askId: 'call_ask_1',
      params: {
        content: 'Need confirmation'
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
        type: 'ask',
        askId: 'call_ask_2',
        ask: {
          reason: 'Need another confirmation',
          blockerType: 'missing_required_input',
          question: 'Confirm again?',
          options: ['Yes', 'No']
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
      completeMessages: [],
      assistantMessages: [],
      requestIds: []
    });

    let resultPromise: Promise<any>;
    runWithContext(
      {
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
      'agentLoopMemory-agent_node': {
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
        askId: 'call_ask_2'
      })
    );
  });

  it('keeps reasoning with hideReason when reasoning display is disabled', async () => {
    const { dispatchRunAgent } = await import('@fastgpt/service/core/workflow/dispatch/ai/agent');
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
        mcpClientMemory: {}
      },
      () => {
        promise = dispatchRunAgent(props);
      }
    );
    const result = await promise;
    expect(result.error?.system_error_text).toBe(
      'common:code_error.sandbox_error.agent_sandbox_permission_denied'
    );
    expect(getSandboxClientMock).not.toHaveBeenCalled();
  });
});
