import { describe, expect, it, vi } from 'vitest';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { createWorkflowAgentLoopRuntime } from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/runtime';

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
    filesMap: {},
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

    expect(runtime.model).toBe('gpt-4');
    expect(runtime.batchToolSize).toBe(5);
    expect(runtime.reasoningEffort).toBeUndefined();
    expect(runtime.userKey).toEqual({ key: 'user-key' });
    expect(runtime.useVision).toBe(true);
    expect(runtime.toolCatalog.runtimeTools.map((item) => item.function.name)).toEqual(['search']);
    expect(runtime.toolCatalog.updatePlanTool?.function.name).toBe('update_plan');
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

    expect(runtime.reasoningEffort).toBe('none');
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
      type: 'tool_response',
      call: toolCall({
        id: 'call_search',
        name: 'search',
        args: '{"q":"FastGPT"}'
      }),
      response: 'tool response',
      seconds: 0.45
    });
    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'call_search',
        runningTime: 0.45,
        llmRequestIds: ['req_tool_node']
      })
    ]);
    runtime.usageSink?.([
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
      usage: {
        moduleName: 'llm',
        model: 'gpt-4',
        totalPoints: 1
      },
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
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalPoints: 1
      },
      seconds: 0.3
    });
    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 2,
      modelName: 'GPT-4',
      requestId: 'req_2',
      finishReason: 'tool_calls',
      answerText: '',
      usage: {
        inputTokens: 6,
        outputTokens: 4,
        totalPoints: 0.5
      },
      seconds: 0.2
    });
    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-1-req_1',
        nodeId: 'agent_node-main_agent-1',
        moduleName: 'chat:master_agent_call',
        moduleType: FlowNodeTypeEnum.agent,
        moduleLogo: 'core/workflow/template/agent',
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
        moduleLogo: 'core/workflow/template/agent',
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
      usage: {
        inputTokens: 8,
        outputTokens: 3,
        totalPoints: 0.4
      },
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
      usage: {
        inputTokens: 1,
        outputTokens: 0,
        totalPoints: 0.1
      },
      seconds: 0.1
    });
    runtime.usageSink?.([
      {
        moduleName: 'account_usage:agent_call',
        model: 'GPT-4',
        totalPoints: 0.1,
        inputTokens: 1,
        outputTokens: 0
      }
    ]);
    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 2,
      modelName: 'GPT-4',
      requestId: 'req_tool_round',
      finishReason: 'tool_calls',
      answerText: '',
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        totalPoints: 1
      },
      seconds: 0.2
    });
    runtime.usageSink?.([
      {
        moduleName: 'account_usage:agent_call',
        model: 'GPT-4',
        totalPoints: 1,
        inputTokens: 10,
        outputTokens: 2
      }
    ]);
    runtime.emitEvent?.({
      type: 'llm_request_end',
      requestIndex: 3,
      modelName: 'GPT-4',
      requestId: 'req_empty_end',
      finishReason: 'close',
      answerText: '',
      usage: {
        inputTokens: 1,
        outputTokens: 0,
        totalPoints: 0.1
      },
      seconds: 0.1
    });
    runtime.usageSink?.([
      {
        moduleName: 'account_usage:agent_call',
        model: 'GPT-4',
        totalPoints: 0.1,
        inputTokens: 1,
        outputTokens: 0
      }
    ]);

    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-1-req_empty_start',
        moduleName: 'chat:master_agent_call',
        moduleLogo: 'core/workflow/template/agent',
        llmRequestIds: ['req_empty_start']
      }),
      expect.objectContaining({
        id: 'agent_node-2-req_tool_round',
        moduleName: 'chat:master_agent_call',
        moduleLogo: 'core/workflow/template/agent',
        llmRequestIds: ['req_tool_round']
      }),
      expect.objectContaining({
        id: 'agent_node-3-req_empty_end',
        moduleName: 'chat:master_agent_call',
        moduleLogo: 'core/workflow/template/agent',
        llmRequestIds: ['req_empty_end']
      })
    ]);
    expect(usagePush).toHaveBeenCalledTimes(3);
  });

  it('records tool-call agent node responses even when provider finish reason is stop', () => {
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
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        totalPoints: 1
      },
      seconds: 0.2
    });

    runtime.emitEvent?.({
      type: 'tool_response',
      call: toolCall({
        id: 'call_update_plan',
        name: 'update_plan'
      }),
      response: 'plan updated',
      seconds: 0.05
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
        moduleName: 'chat:plan_agent',
        runningTime: 0.05,
        agentPlanStatus: 'update_plan',
        textOutput: 'plan updated'
      })
    ]);
  });

  it('attaches tool response compression child to plan tool node responses', () => {
    const { runtime, artifacts } = createWorkflowAgentLoopRuntime({
      context: createContext(),
      usagePush: vi.fn(),
      executeToolFactory: vi.fn()
    });

    runtime.emitEvent?.({
      type: 'tool_response',
      call: toolCall({
        id: 'call_update_plan',
        name: 'update_plan'
      }),
      response: 'plan updated',
      seconds: 0.08,
      toolResponseCompress: {
        response: 'compressed plan response',
        usage: {
          moduleName: 'account_usage:tool_response_compress',
          model: 'GPT-4',
          totalPoints: 0.2,
          inputTokens: 4,
          outputTokens: 2
        },
        requestIds: ['req_plan_compress'],
        seconds: 0.7
      }
    });

    expect(artifacts.nodeResponses).toEqual([
      expect.objectContaining({
        id: 'agent_node-plan-call_update_plan',
        moduleName: 'chat:plan_agent',
        runningTime: 0.08,
        agentPlanStatus: 'update_plan',
        childTotalPoints: 0.2,
        childrenResponses: [
          expect.objectContaining({
            moduleName: 'chat:tool_response_compress',
            textOutput: 'compressed plan response',
            llmRequestIds: ['req_plan_compress']
          })
        ]
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
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        totalPoints: 1
      },
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
    runtime.usageSink?.([
      {
        moduleName: 'Compress Agent',
        model: 'GPT-4',
        totalPoints: 0.1,
        inputTokens: 3,
        outputTokens: 1
      }
    ]);
    runtime.emitEvent?.({
      type: 'after_message_compress',
      usage: {
        moduleName: 'Compress Agent',
        model: 'GPT-4',
        totalPoints: 0.1,
        inputTokens: 3,
        outputTokens: 1
      },
      requestIds: ['req_compress'],
      seconds: 0.11
    });
    runtime.emitEvent?.({
      type: 'tool_response',
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
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        totalPoints: 1
      },
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
      type: 'tool_response',
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
      type: 'tool_response',
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
      usage: {
        inputTokens: 12,
        outputTokens: 3,
        totalPoints: 1.2
      },
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
      usage: {
        inputTokens: 10,
        outputTokens: 2,
        totalPoints: 1
      },
      seconds: 0.2
    });

    runtime.emitEvent?.({
      type: 'after_message_compress',
      usage: {
        moduleName: 'account_usage:compress_llm_messages',
        model: 'GPT-4',
        totalPoints: 0.1,
        inputTokens: 3,
        outputTokens: 1
      },
      requestIds: ['req_compress'],
      seconds: 0.09
    });
    runtime.emitEvent?.({
      type: 'tool_response',
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
        childTotalPoints: 0.3,
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
