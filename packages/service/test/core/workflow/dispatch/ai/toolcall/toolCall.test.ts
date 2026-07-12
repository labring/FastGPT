import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { SANDBOX_SHELL_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { AgentUsageModuleName } from '@fastgpt/service/core/ai/llm/agentLoop/interface';
import { runToolCall } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/toolCall';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { dispatchReadFileToolMock, getSandboxToolInfoMock, runAgentLoopMock, runWorkflowMock } =
  vi.hoisted(() => ({
    dispatchReadFileToolMock: vi.fn(),
    getSandboxToolInfoMock: vi.fn(),
    runAgentLoopMock: vi.fn(),
    runWorkflowMock: vi.fn()
  }));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/toolCall', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/interface/toolCall')>();

  return {
    ...original,
    getSandboxToolInfo: getSandboxToolInfoMock
  };
});

vi.mock('@fastgpt/service/core/ai/llm/agentLoop/interface', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/ai/llm/agentLoop/interface')>();

  return {
    ...original,
    runAgentLoop: runAgentLoopMock
  };
});

vi.mock('@fastgpt/service/core/workflow/dispatch', () => ({
  runWorkflow: runWorkflowMock
}));

vi.mock(
  '@fastgpt/service/core/workflow/dispatch/ai/toolcall/tools/file',
  async (importOriginal) => {
    const original =
      await importOriginal<
        typeof import('@fastgpt/service/core/workflow/dispatch/ai/toolcall/tools/file')
      >();

    return {
      ...original,
      dispatchReadFileTool: dispatchReadFileToolMock
    };
  }
);

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
      flowNodeType: FlowNodeTypeEnum.toolCall
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
      aiChatTopP: 0.7,
      aiChatStopSign: '<END>',
      aiChatResponseFormat: 'json_schema',
      aiChatJsonSchema: '{"name":"tool_call","schema":{"type":"object"}}',
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

const createLoopResult = ({
  usages = [
    {
      moduleName: AgentUsageModuleName.agentCall,
      inputTokens: 10,
      outputTokens: 5,
      totalPoints: 1
    }
  ]
} = {}) => ({
  status: 'done' as const,
  usages,
  usage: {
    inputTokens: 10,
    outputTokens: 5,
    llmTotalPoints: 1
  },
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
  finishReason: 'stop',
  error: undefined,
  requestIds: ['req_main']
});

describe('runToolCall compression node responses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).feConfigs = {};
    getSandboxToolInfoMock.mockImplementation((name: string) => {
      if (name !== SANDBOX_SHELL_TOOL_NAME) return undefined;

      return {
        name: 'Run shell',
        avatar: 'sandbox-avatar'
      };
    });
    runWorkflowMock.mockResolvedValue({
      toolResponse: {
        result: 'search result'
      },
      assistantResponses: [],
      flowUsages: [],
      flatNodeResponses: [
        {
          id: 'search',
          nodeId: 'search',
          moduleType: FlowNodeTypeEnum.tool,
          moduleName: 'Search'
        }
      ],
      runtimeNodeResponseSummary: { hasToolStop: false, runningTime: 0 },
      workflowInteractiveResponse: undefined
    });
  });

  afterEach(() => {
    delete (global as any).feConfigs;
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

      options.runtime.emitEvent({
        type: 'after_message_compress',
        usages: [contextCompressUsage],
        requestIds: ['req_context_compress'],
        seconds: 0.12
      });
      options.runtime.usagePush?.([contextCompressUsage]);
      await options.runtime.executeTool({ call, messages: [] });
      options.runtime.emitEvent({
        type: 'tool_run_end',
        call,
        rawResponse: 'raw tool response',
        response: 'compressed tool response',
        seconds: 0.56,
        toolResponseCompress: {
          response: 'compressed tool response',
          usage: toolResponseCompressUsage,
          requestIds: ['req_tool_response_compress'],
          seconds: 0.34
        }
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
    expect(runAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'fastAgent',
        runtime: expect.objectContaining({
          systemTools: expect.objectContaining({
            plan: { enabled: false },
            ask: { enabled: false }
          }),
          responseParams: {
            retainDatasetCite: true
          },
          llmParams: expect.objectContaining({
            model: 'gpt-4',
            promptMode: 'raw',
            maxTokens: 1000,
            temperature: 0,
            topP: 0.7,
            stop: '<END>',
            reasoningEffort: 'none',
            responseFormat: {
              type: 'json_schema',
              json_schema: '{"name":"tool_call","schema":{"type":"object"}}'
            }
          })
        })
      })
    );
    expect(flowResponses[0].id).toBe('req_context_compress');
    expect(flowResponses[0].nodeId).toBe(flowResponses[0].id);
    expect(flowResponses[1].childrenResponses?.[0].id).toBe('req_tool_response_compress');
    expect(flowResponses[1].childrenResponses?.[0].nodeId).toBe(
      flowResponses[1].childrenResponses?.[0].id
    );
    expect(flowResponses[1].childrenResponses?.[0].compressTextAgent).toBeUndefined();
    expect(flowResponses).toEqual([
      expect.objectContaining({
        moduleName: 'chat:compress_llm_messages',
        moduleType: FlowNodeTypeEnum.toolCall,
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
            moduleName: 'chat:tool_response_compress',
            moduleType: FlowNodeTypeEnum.toolCall,
            moduleLogo: 'core/app/agent/child/contextCompress',
            runningTime: 0.34,
            model: 'GPT-4',
            llmRequestIds: ['req_tool_response_compress'],
            inputTokens: 30,
            outputTokens: 6,
            totalPoints: 0.3,
            textOutput: 'compressed tool response'
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
      options.runtime.emitEvent({
        type: 'after_message_compress',
        usages: [usage],
        requestIds: [],
        seconds: 0.1
      });
      options.runtime.usagePush?.([usage]);

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

  it('ignores context compression callbacks without usage', async () => {
    runAgentLoopMock.mockImplementation(async (options) => {
      options.runtime.emitEvent({
        type: 'after_message_compress',
        requestIds: [],
        seconds: 0.1
      });

      return createLoopResult();
    });

    const result = await runToolCall(createProps());

    expect(result.requestIds).toEqual(['req_main']);
    expect(result.toolDispatchFlowResponses).toEqual([]);
  });

  it('only includes parent agent-call usage in ToolCall model totals', async () => {
    runAgentLoopMock.mockResolvedValue(
      createLoopResult({
        usages: [
          {
            moduleName: AgentUsageModuleName.agentCall,
            inputTokens: 10,
            outputTokens: 5,
            totalPoints: 1
          },
          {
            moduleName: 'child_tool',
            inputTokens: 30,
            outputTokens: 20,
            totalPoints: 4
          }
        ]
      })
    );

    const result = await runToolCall(createProps());

    expect(result.toolCallInputTokens).toBe(10);
    expect(result.toolCallOutputTokens).toBe(5);
    expect(result.toolCallTotalPoints).toBe(1);
  });

  it('records the completed tool flow response after onToolRunEnd with compression child response', async () => {
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

      await options.runtime.executeTool({ call, messages: [] });
      options.runtime.emitEvent({
        type: 'tool_run_end',
        call,
        rawResponse: 'raw tool response',
        response: 'raw tool response',
        seconds: 0.56,
        toolResponseCompress: {
          response: 'compressed tool response',
          usage: toolResponseCompressUsage,
          requestIds: ['req_tool_response_compress'],
          seconds: 0.34
        }
      });

      return createLoopResult();
    });

    const result = await runToolCall(
      createProps({
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
    const [toolFlowResponse] = result.toolDispatchFlowResponses;
    const [toolNodeResponse] = toolFlowResponse.flowResponses;

    expect(toolNodeResponse.childrenResponses).toEqual([
      expect.objectContaining({
        moduleName: 'chat:tool_response_compress',
        textOutput: 'compressed tool response',
        llmRequestIds: ['req_tool_response_compress']
      })
    ]);
    expect(toolNodeResponse.childrenResponses?.[0].compressTextAgent).toBeUndefined();
    expect(toolFlowResponse.flowUsages).toContain(toolResponseCompressUsage);
  });

  it('executes sandbox as an agent-loop system tool and appends sandbox node response', async () => {
    (global as any).feConfigs = {
      show_agent_sandbox: true
    };
    runAgentLoopMock.mockImplementation(async (options) => {
      expect(options.runtime.systemTools).toEqual(
        expect.objectContaining({
          plan: { enabled: false },
          ask: { enabled: false },
          sandbox: expect.objectContaining({
            enabled: true
          })
        })
      );
      expect(options.runtime.lang).toBe('zh-CN');
      expect(options.runtime.systemTools.sandbox).not.toHaveProperty('lang');
      expect(
        options.runtime.toolCatalog.runtimeTools.map((tool: any) => tool.function.name)
      ).toEqual([]);

      options.runtime.emitEvent({
        type: 'tool_run_end',
        call: {
          id: 'call_sandbox',
          type: 'function',
          function: {
            name: SANDBOX_SHELL_TOOL_NAME,
            arguments: '{"command":"pwd"}'
          }
        },
        rawResponse: 'sandbox output',
        response: 'sandbox output',
        usages: [],
        seconds: 0.5
      });

      return createLoopResult();
    });

    const result = await runToolCall(
      createProps({
        params: {
          ...createProps().params,
          useAgentSandbox: true
        },
        lang: 'zh-CN',
        sandboxClient: {} as any
      })
    );
    const [sandboxFlowResponse] = result.toolDispatchFlowResponses;
    const [sandboxNodeResponse] = sandboxFlowResponse.flowResponses;

    expect(sandboxNodeResponse).toEqual(
      expect.objectContaining({
        moduleName: 'Run shell',
        moduleType: FlowNodeTypeEnum.tool,
        moduleLogo: 'sandbox-avatar',
        toolId: SANDBOX_SHELL_TOOL_NAME,
        toolInput: {
          command: 'pwd'
        },
        toolRes: 'sandbox output',
        totalPoints: 0
      })
    );
    expect(sandboxFlowResponse.flowUsages).toEqual([]);
  });

  it('handles invalid system read-file ids without throwing in the adapter', async () => {
    dispatchReadFileToolMock.mockResolvedValue({
      response: '<file><id>missing</id><content>Load file error</content></file>',
      usages: [],
      flowResponse: {
        flowResponses: [
          {
            id: 'call_read',
            nodeId: 'call_read',
            moduleName: 'File parse'
          }
        ],
        flowUsages: [],
        runTimes: 0
      }
    });
    runAgentLoopMock.mockImplementation(async (options) => {
      expect(options.runtime.systemTools.readFile).toEqual(
        expect.objectContaining({
          enabled: true
        })
      );
      const call = {
        id: 'call_read',
        type: 'function',
        function: {
          name: 'read_files',
          arguments: '{"ids":["known","missing"]}'
        }
      };
      const fileResult = await options.runtime.systemTools.readFile.execute({
        call,
        messages: []
      });
      options.runtime.emitEvent({
        type: 'tool_run_end',
        call,
        rawResponse: fileResult.response,
        response: fileResult.response,
        usages: fileResult.usages,
        seconds: 0.1,
        metadata: fileResult.metadata
      });

      return createLoopResult();
    });

    const result = await runToolCall(
      createProps({
        allFiles: new Map([
          ['known', { id: 'known', name: 'known.pdf', url: 'https://files/known.pdf' }]
        ])
      })
    );

    expect(dispatchReadFileToolMock).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [
          {
            id: 'known',
            name: 'known.pdf',
            url: 'https://files/known.pdf'
          },
          {
            id: 'missing',
            url: ''
          }
        ],
        toolCallId: 'call_read'
      })
    );
    expect(result.toolDispatchFlowResponses[0].flowResponses[0]).toEqual(
      expect.objectContaining({
        id: 'call_read',
        moduleName: 'File parse'
      })
    );
  });

  it('executes dataset search as an agent-loop system tool', async () => {
    runWorkflowMock.mockResolvedValueOnce({
      toolResponse: 'dataset ok',
      assistantResponses: [],
      flowUsages: [
        {
          moduleName: 'Dataset search',
          totalPoints: 2
        }
      ],
      flatNodeResponses: [
        {
          id: 'dataset_node',
          nodeId: 'dataset_node',
          moduleType: FlowNodeTypeEnum.datasetSearchNode,
          moduleName: 'Dataset search'
        }
      ],
      runtimeNodeResponseSummary: { hasToolStop: false, runningTime: 0 },
      workflowInteractiveResponse: undefined
    });
    runAgentLoopMock.mockImplementation(async (options) => {
      expect(
        options.runtime.toolCatalog.runtimeTools.map((tool: any) => tool.function.name)
      ).toEqual([]);
      expect(options.runtime.systemTools.datasetSearch).toEqual(
        expect.objectContaining({
          enabled: true,
          currentInputFiles: ['https://files/image.png']
        })
      );

      const call = {
        id: 'call_dataset_search',
        type: 'function',
        function: {
          name: 'dataset_search',
          arguments: JSON.stringify({
            query: ['red shoes']
          })
        }
      };
      const datasetResult = await options.runtime.systemTools.datasetSearch.execute({
        call,
        messages: []
      });
      options.runtime.emitEvent({
        type: 'tool_run_end',
        call,
        rawResponse: datasetResult.response,
        response: datasetResult.response,
        usages: datasetResult.usages,
        seconds: 0.2,
        metadata: datasetResult.metadata
      });

      return createLoopResult();
    });

    const runtimeNodes = [
      {
        nodeId: 'dataset_node',
        flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
        inputs: [
          {
            key: NodeInputKeyEnum.datasetSearchInput,
            value: []
          },
          {
            key: NodeInputKeyEnum.userChatInput,
            value: 'legacy'
          }
        ]
      }
    ];
    const runtimeEdges = [
      {
        target: 'dataset_node'
      }
    ];

    const result = await runToolCall(
      createProps({
        runtimeNodes,
        runtimeEdges,
        params: {
          ...createProps().params,
          fileUrlList: ['https://files/image.png']
        },
        toolNodes: [
          {
            nodeId: 'dataset_node',
            name: 'Dataset search',
            flowNodeType: FlowNodeTypeEnum.datasetSearchNode,
            avatar: 'dataset-avatar',
            toolDescription: 'Search dataset',
            toolParams: []
          }
        ]
      })
    );

    expect(runtimeNodes[0]).toEqual(
      expect.objectContaining({
        nodeId: 'dataset_node',
        isEntry: true,
        inputs: expect.arrayContaining([
          {
            key: NodeInputKeyEnum.datasetSearchInput,
            value: ['red shoes']
          },
          {
            key: NodeInputKeyEnum.userChatInput,
            value: ''
          }
        ])
      })
    );
    expect(runtimeEdges[0]).toEqual({
      target: 'dataset_node',
      status: 'active'
    });
    expect(runWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeNodes,
        isToolCall: true
      })
    );
    expect(result.toolDispatchFlowResponses[0].flowResponses[0]).toEqual(
      expect.objectContaining({
        moduleName: 'Dataset search',
        moduleType: FlowNodeTypeEnum.datasetSearchNode
      })
    );
  });

  it('records a fallback failed tool node response when tool execution throws before returning flowResponse', async () => {
    runWorkflowMock.mockRejectedValueOnce(new Error('network failed'));
    runAgentLoopMock.mockImplementation(async (options) => {
      const call = {
        id: 'call_search',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{"query":"FastGPT"}'
        }
      };

      try {
        await options.runtime.executeTool({ call, messages: [] });
      } catch {
        options.runtime.emitEvent({
          type: 'tool_run_end',
          call,
          rawResponse: 'Tool error: network failed',
          response: 'Tool error: network failed',
          errorMessage: 'Tool error: network failed',
          seconds: 0.56
        });
      }

      return createLoopResult();
    });

    const result = await runToolCall(
      createProps({
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

    expect(result.toolDispatchFlowResponses).toEqual([
      expect.objectContaining({
        flowResponses: [
          expect.objectContaining({
            id: 'call_search',
            nodeId: 'call_search',
            moduleType: FlowNodeTypeEnum.tool,
            moduleName: 'Search',
            moduleLogo: 'tool-avatar',
            toolId: 'search',
            toolInput: {
              query: 'FastGPT'
            },
            toolRes: 'Tool error: network failed',
            errorText: 'Tool error: network failed',
            runningTime: 0.56,
            totalPoints: 0
          })
        ]
      })
    ]);
  });
});
