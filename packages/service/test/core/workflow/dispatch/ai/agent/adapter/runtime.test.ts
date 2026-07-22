import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { createWorkflowAgentLoopRuntime } from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/runtime';

const { dispatchWorkflowReadFilesMock, dispatchAgentDatasetSearchMock } = vi.hoisted(() => ({
  dispatchWorkflowReadFilesMock: vi.fn(),
  dispatchAgentDatasetSearchMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/readFiles', () => ({
  dispatchWorkflowReadFiles: dispatchWorkflowReadFilesMock
}));

vi.mock('@fastgpt/service/core/workflow/dispatch/ai/agent/sub/dataset', () => ({
  dispatchAgentDatasetSearch: dispatchAgentDatasetSearchMock
}));

const tool = (name: string): ChatCompletionTool => ({
  type: 'function',
  function: {
    name,
    description: `${name} description`,
    parameters: {
      type: 'object',
      properties: {}
    }
  }
});

const createContext = (overrides = {}) =>
  ({
    checkIsStopping: vi.fn(() => false),
    externalProvider: {
      openaiAccount: { key: 'user-key' }
    },
    lang: 'zh-CN',
    stream: true,
    node: {
      nodeId: 'agent_node',
      flowNodeType: FlowNodeTypeEnum.agent
    },
    params: {
      model: 'gpt-4',
      aiChatVision: true
    },
    completionTools: [tool('search')],
    getSubAppInfo: (id: string) => ({
      name: id,
      avatar: '',
      toolDescription: ''
    }),
    getSubApp: vi.fn(),
    currentFiles: [],
    runningAppInfo: {
      id: 'app_1'
    },
    uid: 'user_1',
    chatId: 'chat_1',
    runningUserInfo: {
      teamId: 'team_1',
      tmbId: 'tmb_1'
    },
    chatConfig: {},
    ...overrides
  }) as any;

const toolCall = ({ id, name, args = '{}' }: { id: string; name: string; args?: string }) => ({
  id,
  type: 'function' as const,
  function: {
    name,
    arguments: args
  }
});

describe('createWorkflowAgentLoopRuntime', () => {
  it('creates a generic agent loop runtime from workflow context', () => {
    const usagePush = vi.fn();
    const { runtime } = createWorkflowAgentLoopRuntime({
      context: createContext(),
      usagePush,
      executeToolFactory: vi.fn()
    });

    expect(runtime.llmParams.model).toBe('gpt-4');
    expect(runtime.toolCatalog.batchToolSize).toBe(5);
    expect(runtime.llmParams.reasoningEffort).toBeUndefined();
    expect(runtime.llmParams.userKey).toEqual({ key: 'user-key' });
    expect(runtime.llmParams.useVision).toBe(true);
    expect(runtime.responseParams).toEqual({
      retainDatasetCite: undefined
    });
    expect(runtime.lang).toBe('zh-CN');
    expect(runtime.systemTools).toMatchObject({
      plan: { enabled: true },
      ask: { enabled: true }
    });
    expect(runtime.systemTools?.sandbox).toBeUndefined();
    expect(runtime.toolCatalog.runtimeTools.map((item) => item.function.name)).toEqual(['search']);
  });

  it('enables sandbox internal tool only when workflow prepared a sandbox client', () => {
    const sandboxClient = {
      provider: {},
      exec: vi.fn()
    };
    const { runtime } = createWorkflowAgentLoopRuntime({
      context: createContext({
        sandboxClient
      }),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn()
    });

    expect(runtime.systemTools?.sandbox).toMatchObject({
      enabled: true,
      client: sandboxClient
    });
  });

  it('records sandbox node responses from tool_run_end events', async () => {
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: createContext({
        sandboxClient: {
          provider: {},
          exec: vi.fn()
        }
      }),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn()
    });

    expect(runtime.toolCatalog.runtimeTools.map((item) => item.function.name)).toEqual(['search']);

    const call = toolCall({
      id: 'call_sandbox',
      name: 'sandbox_shell',
      args: '{"command":"pwd"}'
    });

    runtime.emitEvent?.({
      type: 'tool_run_end',
      call,
      rawResponse: 'sandbox output',
      response: 'sandbox output',
      seconds: 0.2,
      metadata: {
        id: 'call_sandbox',
        nodeId: 'call_sandbox',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'Sandbox',
        toolRes: 'sandbox output'
      }
    });

    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'call_sandbox',
        moduleName: 'Sandbox',
        toolRes: 'sandbox output'
      })
    ]);
  });

  it('streams sandbox tools without duplicating node responses', async () => {
    const workflowStreamResponse = vi.fn();
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: createContext({
        sandboxClient: {
          provider: {},
          exec: vi.fn()
        }
      }),
      workflowStreamResponse,
      usagePush: vi.fn(),
      executeToolFactory: vi.fn()
    });
    const call = toolCall({
      id: 'call_sandbox',
      name: 'sandbox_shell',
      args: '{"command":"pwd"}'
    });

    runtime.emitEvent?.({
      type: 'tool_call',
      call
    });
    runtime.emitEvent?.({
      type: 'tool_run_end',
      call,
      rawResponse: 'sandbox output',
      response: 'sandbox output',
      seconds: 0.2,
      metadata: {
        id: 'call_sandbox',
        nodeId: 'call_sandbox',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'Sandbox',
        toolRes: 'sandbox output'
      }
    });

    expect(workflowStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'call_sandbox',
        event: expect.any(String)
      })
    );
    expect(artifacts.assistantResponses).toEqual([]);
    expect(artifacts.nodeResponses).toHaveLength(1);
    expect(artifacts.nodeResponses[0]).toEqual(
      expect.objectContaining({
        id: 'call_sandbox',
        moduleName: 'Sandbox',
        toolRes: 'sandbox output'
      })
    );
  });

  it('exposes readFile as an internal tool executor for direct model URLs', async () => {
    const response = JSON.stringify([
      {
        url: 'https://files/a.pdf',
        name: 'a.pdf',
        content: 'file content'
      }
    ]);
    dispatchWorkflowReadFilesMock.mockResolvedValue({
      response,
      usages: [],
      nodeResponse: {
        id: 'call_read_file',
        nodeId: 'call_read_file',
        moduleType: FlowNodeTypeEnum.readFiles,
        moduleName: 'Read file'
      }
    });
    const { runtime } = createWorkflowAgentLoopRuntime({
      context: createContext(),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn()
    });

    const result = await runtime.systemTools?.readFile?.execute({
      messages: [],
      call: toolCall({
        id: 'call_read_file',
        name: 'read_files',
        args: '{"urls":["https://files/a.pdf"]}'
      })
    });

    expect(dispatchWorkflowReadFilesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        files: [{ url: 'https://files/a.pdf' }]
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        response,
        metadata: expect.objectContaining({
          moduleName: 'Read file'
        })
      })
    );
  });

  it('exposes datasetSearch as a system tool executor when datasets are configured', async () => {
    const usage = {
      moduleName: 'Dataset search',
      totalPoints: 2
    };
    const userKey = {
      key: 'user-key'
    };
    dispatchAgentDatasetSearchMock.mockResolvedValue({
      response: 'dataset content',
      usages: [usage],
      nodeResponse: {
        moduleName: 'Dataset search'
      }
    });
    const { runtime } = createWorkflowAgentLoopRuntime({
      context: createContext({
        requestOrigin: 'https://fastgpt.example.com',
        externalProvider: {
          openaiAccount: userKey
        },
        currentFiles: [
          {
            id: 'file_1',
            name: 'image.png',
            type: ChatFileTypeEnum.image,
            url: 'https://fastgpt.example.com/api/file/image.png'
          }
        ],
        params: {
          model: 'gpt-4',
          agent_datasetParams: {
            datasets: [{ datasetId: 'dataset_1' }]
          }
        }
      }),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn()
    });

    expect(runtime.systemTools?.datasetSearch).toMatchObject({
      enabled: true,
      currentInputFiles: ['https://fastgpt.example.com/api/file/image.png']
    });

    const result = await runtime.systemTools?.datasetSearch?.execute({
      messages: [],
      call: toolCall({
        id: 'call_dataset_search',
        name: 'dataset_search',
        args: '{"query":["FastGPT"]}'
      })
    });

    expect(dispatchAgentDatasetSearchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        args: '{"query":["FastGPT"]}',
        datasetParams: {
          datasets: [{ datasetId: 'dataset_1' }]
        },
        teamId: 'team_1',
        tmbId: 'tmb_1',
        llmModel: 'gpt-4',
        userKey
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        response: 'dataset content',
        usages: [usage],
        metadata: expect.objectContaining({
          id: 'call_dataset_search',
          nodeId: 'call_dataset_search',
          moduleName: 'Dataset search',
          totalPoints: 2
        })
      })
    );
  });

  it('passes workflow reasoning effort into the generic agent runtime', () => {
    const { runtime } = createWorkflowAgentLoopRuntime({
      context: createContext({
        params: {
          model: 'qwen3.6-flash',
          aiChatReasoningEffort: 'none'
        }
      }),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn()
    });

    expect(runtime.llmParams.reasoningEffort).toBe('none');
  });

  it('wraps workflow tool execution and collects artifacts', async () => {
    const executeTool = vi.fn(async () => ({
      response: 'tool response',
      usages: [
        {
          moduleName: 'tool',
          model: 'tool',
          totalPoints: 2
        }
      ],
      nodeResponse: {
        nodeId: 'call_search',
        id: 'call_search',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'Search',
        llmRequestIds: ['req_tool_node']
      }
    }));
    const usagePush = vi.fn();
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: createContext(),
      usagePush,
      executeToolFactory: vi.fn(() => executeTool)
    });

    const result = await runtime.executeTool({
      messages: [],
      call: {
        id: 'call_search',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{"q":"FastGPT"}'
        }
      }
    });

    expect(executeTool).toHaveBeenCalledWith({
      callId: 'call_search',
      toolId: 'search',
      args: '{"q":"FastGPT"}'
    });
    expect(result).toMatchObject({
      response: 'tool response',
      usages: [
        {
          moduleName: 'tool',
          model: 'tool',
          totalPoints: 2
        }
      ]
    });
    expect(artifacts.nodeResponses).toEqual([]);
    runtime.emitEvent?.({
      type: 'tool_run_end',
      call: toolCall({
        id: 'call_search',
        name: 'search',
        args: '{"q":"FastGPT"}'
      }),
      response: 'tool response',
      usages: [
        {
          moduleName: 'llm',
          model: 'gpt-4',
          totalPoints: 1
        }
      ],
      seconds: 0.45
    });
    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'call_search',
        runningTime: 0.45,
        llmRequestIds: ['req_tool_node']
      })
    ]);
    expect(usagePush).not.toHaveBeenCalled();
    runtime.usagePush?.([
      {
        moduleName: 'llm',
        model: 'gpt-4',
        totalPoints: 1
      }
    ]);
    expect(usagePush).toHaveBeenCalledWith([
      {
        moduleName: 'llm',
        model: 'gpt-4',
        totalPoints: 1
      }
    ]);
    runtime.emitEvent?.({
      type: 'after_message_compress',
      usages: [
        {
          moduleName: 'llm',
          model: 'gpt-4',
          totalPoints: 1
        }
      ],
      requestIds: ['req_compress'],
      seconds: 0.12
    });
    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'call_search',
        llmRequestIds: ['req_tool_node']
      }),
      expect.objectContaining({
        id: 'req_compress',
        moduleName: 'chat:compress_llm_messages',
        runningTime: 0.12,
        llmRequestIds: ['req_compress']
      })
    ]);
    expect(usagePush).toHaveBeenCalledTimes(1);
  });

  it('collects LLM request ids from lifecycle events', () => {
    const workflowStreamResponse = vi.fn();
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: createContext(),
      usagePush: vi.fn(),
      workflowStreamResponse,
      executeToolFactory: vi.fn()
    });

    runtime.emitEvent?.({
      type: 'llm_request_start',
      requestIndex: 1,
      modelName: 'GPT-4'
    });
    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_1',
      finishReason: 'stop',
      answerText: 'final answer',
      reasoningText: 'reasoning',
      usages: [
        {
          inputTokens: 10,
          outputTokens: 5,
          totalPoints: 1
        }
      ],
      seconds: 0.3
    });
    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 2,
      modelName: 'GPT-4',
      requestId: 'req_2',
      finishReason: 'tool_calls',
      answerText: '',
      usages: [
        {
          inputTokens: 6,
          outputTokens: 4,
          totalPoints: 0.5
        }
      ],
      seconds: 0.2
    });
    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-1-req_1',
        nodeId: 'agent_node-main_agent-1',
        moduleName: 'chat:master_agent_call',
        moduleType: FlowNodeTypeEnum.agent,
        moduleLogo: 'core/app/type/agentFill',
        model: 'GPT-4',
        llmRequestIds: ['req_1'],
        inputTokens: 10,
        outputTokens: 5,
        totalPoints: 1,
        finishReason: 'stop',
        textOutput: 'final answer',
        reasoningText: 'reasoning',
        runningTime: 0.3
      }),
      expect.objectContaining({
        id: 'agent_node-2-req_2',
        nodeId: 'agent_node-main_agent-2',
        moduleName: 'chat:master_agent_call',
        moduleType: FlowNodeTypeEnum.agent,
        moduleLogo: 'core/app/type/agentFill',
        model: 'GPT-4',
        llmRequestIds: ['req_2'],
        inputTokens: 6,
        outputTokens: 4,
        totalPoints: 0.5,
        finishReason: 'tool_calls',
        runningTime: 0.2
      })
    ]);
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      event: 'flowNodeStatus',
      data: {
        status: 'running',
        name: 'GPT-4'
      }
    });
  });

  it('records abnormal close finish reason from llm request', () => {
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: createContext(),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn()
    });

    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_interrupted',
      finishReason: 'abnormal_close',
      answerText: 'partial answer',
      usages: [
        {
          inputTokens: 8,
          outputTokens: 3,
          totalPoints: 0.4
        }
      ],
      seconds: 0.2
    });

    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-1-req_interrupted',
        moduleName: 'chat:master_agent_call',
        finishReason: 'abnormal_close',
        textOutput: 'partial answer'
      })
    ]);
    expect(artifacts.nodeResponses[0]).not.toHaveProperty('errorText');
  });

  it('records empty agent node responses with request ids', () => {
    const usagePush = vi.fn();
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: createContext(),
      usagePush,
      executeToolFactory: vi.fn()
    });

    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_empty_start',
      finishReason: 'stop',
      answerText: '',
      reasoningText: '',
      usages: [
        {
          moduleName: 'account_usage:agent_call',
          model: 'GPT-4',
          totalPoints: 0.1,
          inputTokens: 1,
          outputTokens: 0
        }
      ],
      seconds: 0.1
    });
    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 2,
      modelName: 'GPT-4',
      requestId: 'req_tool_round',
      finishReason: 'tool_calls',
      answerText: '',
      usages: [
        {
          moduleName: 'account_usage:agent_call',
          model: 'GPT-4',
          totalPoints: 1,
          inputTokens: 10,
          outputTokens: 2
        }
      ],
      seconds: 0.2
    });
    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 3,
      modelName: 'GPT-4',
      requestId: 'req_empty_end',
      finishReason: 'close',
      answerText: '',
      usages: [
        {
          moduleName: 'account_usage:agent_call',
          model: 'GPT-4',
          totalPoints: 0.1,
          inputTokens: 1,
          outputTokens: 0
        }
      ],
      seconds: 0.1
    });

    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-1-req_empty_start',
        moduleName: 'chat:master_agent_call',
        moduleLogo: 'core/app/type/agentFill',
        llmRequestIds: ['req_empty_start']
      }),
      expect.objectContaining({
        id: 'agent_node-2-req_tool_round',
        moduleName: 'chat:master_agent_call',
        moduleLogo: 'core/app/type/agentFill',
        llmRequestIds: ['req_tool_round']
      }),
      expect.objectContaining({
        id: 'agent_node-3-req_empty_end',
        moduleName: 'chat:master_agent_call',
        moduleLogo: 'core/app/type/agentFill',
        llmRequestIds: ['req_empty_end']
      })
    ]);
    expect(usagePush).not.toHaveBeenCalled();
  });

  it('records LLM and plan-operation node responses independently', () => {
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: createContext(),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn()
    });

    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_master_tool_stop',
      finishReason: 'stop',
      answerText: '',
      toolCalls: [
        {
          id: 'call_update_plan',
          type: 'function',
          function: {
            name: 'update_plan',
            arguments: '{}'
          }
        }
      ],
      usages: [
        {
          inputTokens: 10,
          outputTokens: 2,
          totalPoints: 1
        }
      ],
      seconds: 0.2
    });

    runtime.emitEvent?.({
      type: 'plan_operation',
      operation: 'update_steps',
      success: true,
      message: 'plan updated',
      id: 'call_update_plan',
      params: '{}',
      seconds: 0.05,
      plan: {
        planId: 'plan_1',
        name: 'Implementation plan',
        description: null,
        steps: [{ id: 'step_1', name: 'Implement plan events', status: 'done' }]
      }
    });

    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-1-req_master_tool_stop',
        moduleName: 'chat:master_agent_call',
        llmRequestIds: ['req_master_tool_stop'],
        finishReason: 'stop'
      }),
      expect.objectContaining({
        id: 'agent_node-plan-call_update_plan',
        moduleName: 'chat:plan_update',
        runningTime: 0.05,
        agentPlanStatus: 'update_plan',
        agentPlanResult: 'plan updated'
      })
    ]);
  });

  it('flattens tool and child LLM node responses in call order', async () => {
    const executeTool = vi.fn(async () => ({
      response: 'search result',
      usages: [],
      nodeResponse: {
        nodeId: 'call_search',
        id: 'call_search',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'Search',
        totalPoints: 2
      }
    }));
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: createContext(),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn(() => executeTool)
    });

    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_master',
      finishReason: 'tool_calls',
      usages: [
        {
          inputTokens: 10,
          outputTokens: 2,
          totalPoints: 1
        }
      ],
      seconds: 0.2
    });

    await runtime.executeTool({
      messages: [],
      call: toolCall({
        id: 'call_search',
        name: 'search',
        args: '{"q":"FastGPT"}'
      })
    });
    runtime.emitEvent?.({
      type: 'after_message_compress',
      usages: [
        {
          moduleName: 'Compress Agent',
          model: 'GPT-4',
          totalPoints: 0.1,
          inputTokens: 3,
          outputTokens: 1
        }
      ],
      requestIds: ['req_compress'],
      seconds: 0.11
    });
    runtime.emitEvent?.({
      type: 'tool_run_end',
      call: toolCall({
        id: 'call_search',
        name: 'search',
        args: '{"q":"FastGPT"}'
      }),
      response: 'search result',
      seconds: 0.33
    });

    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-1-req_master',
        moduleName: 'chat:master_agent_call',
        totalPoints: 1
      }),
      expect.objectContaining({
        id: 'req_compress',
        moduleName: 'chat:compress_llm_messages',
        runningTime: 0.11,
        totalPoints: 0.1,
        llmRequestIds: ['req_compress']
      }),
      expect.objectContaining({
        id: 'call_search',
        moduleName: 'Search',
        runningTime: 0.33,
        totalPoints: 2
      })
    ]);
  });

  it('records one agent node, each tool node, then the next agent node for a tool round', async () => {
    const executeTool = vi.fn(async ({ callId }) => ({
      response: `${callId} response`,
      usages: [],
      nodeResponse: {
        nodeId: callId,
        id: callId,
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: callId === 'call_search' ? 'Search' : 'Time'
      }
    }));
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: createContext(),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn(() => executeTool)
    });

    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_call_tools',
      finishReason: 'tool_calls',
      toolCalls: [
        {
          id: 'call_search',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"q":"FastGPT"}'
          }
        },
        {
          id: 'call_time',
          type: 'function',
          function: {
            name: 'time',
            arguments: '{}'
          }
        }
      ],
      usages: [
        {
          inputTokens: 10,
          outputTokens: 2,
          totalPoints: 1
        }
      ],
      seconds: 0.2
    });

    await runtime.executeTool({
      messages: [],
      call: toolCall({
        id: 'call_search',
        name: 'search',
        args: '{"q":"FastGPT"}'
      })
    });
    runtime.emitEvent?.({
      type: 'tool_run_end',
      call: toolCall({
        id: 'call_search',
        name: 'search',
        args: '{"q":"FastGPT"}'
      }),
      response: 'call_search response',
      seconds: 0.41
    });
    await runtime.executeTool({
      messages: [],
      call: toolCall({
        id: 'call_time',
        name: 'time'
      })
    });
    runtime.emitEvent?.({
      type: 'tool_run_end',
      call: toolCall({
        id: 'call_time',
        name: 'time'
      }),
      response: 'call_time response',
      seconds: 0.42
    });

    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 2,
      modelName: 'GPT-4',
      requestId: 'req_after_tools',
      finishReason: 'stop',
      answerText: 'done',
      usages: [
        {
          inputTokens: 12,
          outputTokens: 3,
          totalPoints: 1.2
        }
      ],
      seconds: 0.3
    });

    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-1-req_call_tools',
        moduleName: 'chat:master_agent_call',
        finishReason: 'tool_calls',
        llmRequestIds: ['req_call_tools']
      }),
      expect.objectContaining({
        id: 'call_search',
        moduleName: 'Search',
        runningTime: 0.41
      }),
      expect.objectContaining({
        id: 'call_time',
        moduleName: 'Time',
        runningTime: 0.42
      }),
      expect.objectContaining({
        id: 'agent_node-2-req_after_tools',
        moduleName: 'chat:master_agent_call',
        finishReason: 'stop',
        textOutput: 'done',
        llmRequestIds: ['req_after_tools']
      })
    ]);
  });

  it('keeps agent compression node responses readable in run details', () => {
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: createContext(),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn()
    });

    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_master',
      finishReason: 'tool_calls',
      usages: [
        {
          inputTokens: 10,
          outputTokens: 2,
          totalPoints: 1
        }
      ],
      seconds: 0.2
    });

    runtime.emitEvent?.({
      type: 'after_message_compress',
      usages: [
        {
          moduleName: 'account_usage:compress_llm_messages',
          model: 'GPT-4',
          totalPoints: 0.1,
          inputTokens: 3,
          outputTokens: 1
        }
      ],
      requestIds: ['req_compress'],
      seconds: 0.09
    });
    runtime.emitEvent?.({
      type: 'tool_run_end',
      call: toolCall({
        id: 'call_search',
        name: 'search'
      }),
      response: 'compressed tool response',
      seconds: 0.77,
      toolResponseCompress: {
        response: 'compressed tool response',
        usage: {
          moduleName: 'account_usage:tool_response_compress',
          model: 'GPT-4',
          totalPoints: 0.3,
          inputTokens: 5,
          outputTokens: 3
        },
        requestIds: ['req_tool_response_compress'],
        seconds: 1.5
      }
    });

    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-1-req_master',
        moduleName: 'chat:master_agent_call'
      }),
      expect.objectContaining({
        id: 'req_compress',
        moduleName: 'chat:compress_llm_messages',
        moduleLogo: 'core/app/agent/child/contextCompress',
        runningTime: 0.09,
        llmRequestIds: ['req_compress']
      }),
      expect.objectContaining({
        id: 'call_search',
        runningTime: 0.77,
        childrenResponses: [
          expect.objectContaining({
            moduleName: 'chat:tool_response_compress',
            moduleLogo: 'core/app/agent/child/contextCompress',
            runningTime: 1.5,
            llmRequestIds: ['req_tool_response_compress']
          })
        ]
      })
    ]);
  });
});
