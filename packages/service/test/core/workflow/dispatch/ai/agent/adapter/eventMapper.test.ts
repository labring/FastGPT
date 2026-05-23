import { describe, expect, it, vi } from 'vitest';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { createWorkflowAgentLoopEventMapper } from '@fastgpt/service/core/workflow/dispatch/ai/agent/adapter/eventMapper';

const createPlan = () => ({
  planId: 'plan_1',
  task: 'Investigate',
  description: 'Investigate code',
  steps: [
    {
      id: 's1',
      title: 'Read code',
      description: 'Read code',
      acceptanceCriteria: [],
      status: 'pending' as const,
      evidence: []
    }
  ]
});

const toolResponse = ({ id, name, response }: { id: string; name: string; response: string }) =>
  ({
    type: 'tool_response',
    call: {
      id,
      type: 'function',
      function: {
        name,
        arguments: ''
      }
    },
    response,
    seconds: 0.1
  }) as const;

const createToolCall = ({ id, name, args = '{}' }: { id: string; name: string; args?: string }) =>
  ({
    id,
    type: 'function',
    function: {
      name,
      arguments: args
    }
  }) as const;

const toolCall = (params: { id: string; name: string; args?: string }) =>
  ({
    type: 'tool_call',
    call: createToolCall(params)
  }) as const;

describe('createWorkflowAgentLoopEventMapper', () => {
  it('streams main answer deltas', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: () => ({
        name: '',
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'answer_delta',
      text: 'main answer'
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(1);
    expect(workflowStreamResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        event: SseResponseEventEnum.answer
      })
    );
  });

  it('streams model request lifecycle as workflow node status', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: () => ({
        name: '',
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'llm_request_start',
      requestIndex: 2,
      modelName: 'GPT-4'
    });
    mapper.emitEvent({
      type: 'llm_request_end',
      requestIndex: 2,
      modelName: 'GPT-4',
      requestId: 'req_2',
      finishReason: 'stop'
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(1);
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      event: SseResponseEventEnum.flowNodeStatus,
      data: {
        status: 'running',
        name: 'GPT-4'
      }
    });
  });

  it('hides reasoning stream but persists reasoning with hideReason', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: (id) => ({
        name: id,
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set(),
      showReasoning: false
    });

    mapper.emitEvent({
      type: 'reasoning_delta',
      text: 'hidden'
    });
    expect(workflowStreamResponse).not.toHaveBeenCalled();

    mapper.emitEvent({
      type: 'tool_call',
      call: {
        id: 'call_search',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{}'
        }
      }
    });
    mapper.emitEvent({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_search',
      finishReason: 'tool_calls',
      answerText: 'Need to search.',
      reasoningText: 'hidden thinking',
      toolCalls: [
        {
          id: 'call_search',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{}'
          }
        }
      ]
    });

    expect(mapper.assistantResponses).toEqual([
      {
        text: {
          content: 'Need to search.'
        },
        reasoning: {
          content: 'hidden thinking'
        },
        hideReason: true
      },
      {
        id: 'call_search',
        tools: [
          {
            id: 'call_search',
            toolName: 'search',
            toolAvatar: '',
            functionName: 'search',
            params: '{}'
          }
        ]
      }
    ]);
  });

  it('persists the first reasoning text on reasoning-only tool requests', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: (id) => ({
        name: id,
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'reasoning_delta',
      text: 'first reasoning'
    });
    mapper.emitEvent(toolCall({ id: 'call_time', name: 'get_time' }));
    mapper.emitEvent({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_tool',
      finishReason: 'tool_calls',
      reasoningText: 'first reasoning',
      toolCalls: [createToolCall({ id: 'call_time', name: 'get_time' })]
    });
    mapper.emitEvent({
      ...toolResponse({
        id: 'call_time',
        name: 'get_time',
        response: '2026-05-22 10:00:00'
      })
    });

    // Final answer values are appended by the agent dispatcher after the loop finishes.
    mapper.assistantResponses.push({
      text: {
        content: '现在是 10 点。'
      },
      reasoning: {
        content: 'second reasoning'
      }
    });

    expect(mapper.assistantResponses).toEqual([
      {
        id: 'call_time',
        reasoning: {
          content: 'first reasoning'
        },
        tools: [
          {
            id: 'call_time',
            toolName: 'get_time',
            toolAvatar: '',
            functionName: 'get_time',
            params: '{}',
            response: '2026-05-22 10:00:00'
          }
        ]
      },
      {
        text: {
          content: '现在是 10 点。'
        },
        reasoning: {
          content: 'second reasoning'
        }
      }
    ]);

    const restoredMessages = chats2GPTMessages({
      messages: [
        {
          obj: ChatRoleEnum.AI,
          value: mapper.assistantResponses
        }
      ],
      reserveId: false,
      reserveTool: true
    });

    expect(restoredMessages).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'first reasoning',
        tool_calls: [
          {
            id: 'call_time',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_time',
        content: '2026-05-22 10:00:00'
      },
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: '现在是 10 点。',
        reasoning_content: 'second reasoning'
      }
    ]);
  });

  it('persists hidden reasoning on reasoning-only tool requests', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: (id) => ({
        name: id,
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set(),
      showReasoning: false
    });

    mapper.emitEvent({
      type: 'reasoning_delta',
      text: 'hidden first reasoning'
    });
    mapper.emitEvent(toolCall({ id: 'call_time', name: 'get_time' }));
    mapper.emitEvent({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_tool',
      finishReason: 'tool_calls',
      reasoningText: 'hidden first reasoning',
      toolCalls: [createToolCall({ id: 'call_time', name: 'get_time' })]
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(1);
    expect(workflowStreamResponse).toHaveBeenCalledWith({
      id: 'call_time',
      event: SseResponseEventEnum.toolCall,
      data: {
        tool: {
          id: 'call_time',
          toolName: 'get_time',
          toolAvatar: '',
          functionName: 'get_time',
          params: '{}'
        }
      }
    });
    expect(mapper.assistantResponses).toEqual([
      {
        id: 'call_time',
        reasoning: {
          content: 'hidden first reasoning'
        },
        hideReason: true,
        tools: [
          {
            id: 'call_time',
            toolName: 'get_time',
            toolAvatar: '',
            functionName: 'get_time',
            params: '{}'
          }
        ]
      }
    ]);
  });

  it('restores reasoning-only tool call values as one assistant tool_calls array', () => {
    const mapper = createWorkflowAgentLoopEventMapper({
      getSubAppInfo: (id) => ({
        name: id,
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent(toolCall({ id: 'call_weather', name: 'weather', args: '{"city":"Beijing"}' }));
    mapper.emitEvent(toolCall({ id: 'call_time', name: 'time' }));
    mapper.emitEvent({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_parallel',
      finishReason: 'tool_calls',
      reasoningText: 'Need weather and time.',
      toolCalls: [
        createToolCall({ id: 'call_weather', name: 'weather', args: '{"city":"Beijing"}' }),
        createToolCall({ id: 'call_time', name: 'time' })
      ]
    });
    mapper.emitEvent({
      ...toolResponse({
        id: 'call_weather',
        name: 'weather',
        response: 'sunny'
      })
    });
    mapper.emitEvent({
      ...toolResponse({
        id: 'call_time',
        name: 'time',
        response: '10:00'
      })
    });

    expect(mapper.assistantResponses).toEqual([
      {
        id: 'call_weather',
        reasoning: {
          content: 'Need weather and time.'
        },
        tools: [
          expect.objectContaining({
            id: 'call_weather',
            functionName: 'weather',
            response: 'sunny'
          })
        ]
      },
      {
        id: 'call_time',
        tools: [
          expect.objectContaining({
            id: 'call_time',
            functionName: 'time',
            response: '10:00'
          })
        ]
      }
    ]);

    const restoredMessages = chats2GPTMessages({
      messages: [
        {
          obj: ChatRoleEnum.AI,
          value: mapper.assistantResponses
        }
      ],
      reserveId: false,
      reserveTool: true
    });

    expect(restoredMessages).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need weather and time.',
        tool_calls: [
          {
            id: 'call_weather',
            type: 'function',
            function: {
              name: 'weather',
              arguments: '{"city":"Beijing"}'
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
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_weather',
        content: 'sunny'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_time',
        content: '10:00'
      }
    ]);
  });

  it('filters internal tool calls and streams runtime tool lifecycle events', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: (id) => ({
        name: id === 'search' ? 'Search' : id,
        avatar: 'avatar',
        toolDescription: ''
      }),
      internalToolNames: new Set(['ask_agent', 'update_plan']),
      updatePlanToolName: 'update_plan',
      askToolName: 'ask_agent'
    });

    mapper.emitEvent({
      type: 'tool_call',
      call: {
        id: 'call_update_plan',
        type: 'function',
        function: {
          name: 'update_plan',
          arguments: '{}'
        }
      }
    });
    mapper.emitEvent({
      type: 'tool_params',
      callId: 'call_update_plan',
      argsDelta: '{"action":"create"}'
    });
    mapper.emitEvent({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_update_plan',
      finishReason: 'tool_calls',
      answerText: 'draft before plan',
      reasoningText: 'planning',
      toolCalls: [
        {
          id: 'call_update_plan',
          type: 'function',
          function: {
            name: 'update_plan',
            arguments: '{}{"action":"create"}'
          }
        }
      ]
    });
    mapper.emitEvent({
      ...toolResponse({
        id: 'call_update_plan',
        name: 'update_plan',
        response: 'ok'
      })
    });
    mapper.emitEvent({
      type: 'tool_call',
      call: {
        id: 'call_search',
        type: 'function',
        function: {
          name: 'search',
          arguments: ''
        }
      }
    });
    mapper.emitEvent({
      type: 'tool_params',
      callId: 'call_search',
      argsDelta: '{"q":'
    });
    mapper.emitEvent({
      type: 'tool_params',
      callId: 'call_search',
      argsDelta: '"FastGPT"}'
    });
    mapper.emitEvent({
      type: 'llm_request_end',
      requestIndex: 2,
      modelName: 'GPT-4',
      requestId: 'req_search',
      finishReason: 'tool_calls',
      answerText: 'I will search first.',
      reasoningText: 'Need external data.',
      toolCalls: [
        {
          id: 'call_search',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"q":"FastGPT"}'
          }
        }
      ]
    });
    mapper.emitEvent({
      ...toolResponse({
        id: 'call_search',
        name: 'search',
        response: 'Search '
      })
    });
    mapper.emitEvent({
      ...toolResponse({
        id: 'call_search',
        name: 'search',
        response: 'result'
      })
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(5);
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'call_search',
        event: SseResponseEventEnum.toolCall,
        data: {
          tool: {
            id: 'call_search',
            toolName: 'Search',
            toolAvatar: 'avatar',
            functionName: 'search',
            params: ''
          }
        }
      })
    );
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(
      5,
      expect.objectContaining({
        id: 'call_search',
        event: SseResponseEventEnum.toolResponse
      })
    );
    expect(mapper.assistantResponses).toEqual([
      {
        id: 'call_update_plan',
        agentPlanUpdate: {
          id: 'call_update_plan',
          functionName: 'update_plan',
          params: '{}{"action":"create"}',
          response: 'ok',
          assistantText: 'draft before plan',
          reasoningText: 'planning'
        }
      },
      {
        text: {
          content: 'I will search first.'
        },
        reasoning: {
          content: 'Need external data.'
        }
      },
      {
        id: 'call_search',
        tools: [
          {
            id: 'call_search',
            toolName: 'Search',
            toolAvatar: 'avatar',
            functionName: 'search',
            params: '{"q":"FastGPT"}',
            response: 'Search result'
          }
        ]
      }
    ]);
  });

  it('streams partial tool call args and later tool params in order', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: (id) => ({
        name: id === 'weather' ? 'Weather' : id,
        avatar: 'avatar',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'tool_call',
      call: {
        id: 'call_weather',
        type: 'function',
        function: {
          name: 'weather',
          arguments: '{"city"'
        }
      }
    });
    mapper.emitEvent({
      type: 'tool_params',
      callId: 'call_weather',
      argsDelta: ':"Beijing"}'
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(2);
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id: 'call_weather',
        event: SseResponseEventEnum.toolCall,
        data: {
          tool: expect.objectContaining({
            params: '{"city"'
          })
        }
      })
    );
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id: 'call_weather',
        event: SseResponseEventEnum.toolParams,
        data: {
          tool: {
            id: 'call_weather',
            params: ':"Beijing"}'
          }
        }
      })
    );
    expect(mapper.assistantResponses).toEqual([
      {
        id: 'call_weather',
        tools: [
          {
            id: 'call_weather',
            toolName: 'Weather',
            toolAvatar: 'avatar',
            functionName: 'weather',
            params: '{"city":"Beijing"}'
          }
        ]
      }
    ]);
  });

  it('keeps runtime tool calls as separate assistant response values', () => {
    const mapper = createWorkflowAgentLoopEventMapper({
      getSubAppInfo: (id) => ({
        name: id,
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'tool_call',
      call: {
        id: 'call_weather',
        type: 'function',
        function: {
          name: 'weather',
          arguments: '{"city":"Beijing"}'
        }
      }
    });
    mapper.emitEvent({
      type: 'tool_call',
      call: {
        id: 'call_time',
        type: 'function',
        function: {
          name: 'time',
          arguments: '{}'
        }
      }
    });
    mapper.emitEvent({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_parallel',
      finishReason: 'tool_calls',
      answerText: 'Checking both tools.',
      reasoningText: 'Need weather and time.',
      toolCalls: [
        {
          id: 'call_weather',
          type: 'function',
          function: {
            name: 'weather',
            arguments: '{"city":"Beijing"}'
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
      ]
    });

    expect(mapper.assistantResponses).toEqual([
      {
        text: {
          content: 'Checking both tools.'
        },
        reasoning: {
          content: 'Need weather and time.'
        }
      },
      {
        id: 'call_weather',
        tools: [
          expect.objectContaining({
            id: 'call_weather',
            functionName: 'weather',
            params: '{"city":"Beijing"}'
          })
        ]
      },
      {
        id: 'call_time',
        tools: [
          expect.objectContaining({
            id: 'call_time',
            functionName: 'time',
            params: '{}'
          })
        ]
      }
    ]);
  });

  it('restores continuous assistant text with consecutive tool calls as one assistant message', () => {
    const mapper = createWorkflowAgentLoopEventMapper({
      getSubAppInfo: (id) => ({
        name: id,
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'tool_call',
      call: {
        id: 'call_weather',
        type: 'function',
        function: {
          name: 'weather',
          arguments: '{"city":"Beijing"}'
        }
      }
    });
    mapper.emitEvent({
      type: 'tool_call',
      call: {
        id: 'call_time',
        type: 'function',
        function: {
          name: 'time',
          arguments: '{}'
        }
      }
    });
    mapper.emitEvent({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_parallel',
      finishReason: 'tool_calls',
      answerText: 'Checking both tools.',
      reasoningText: 'Need weather and time.',
      toolCalls: [
        {
          id: 'call_weather',
          type: 'function',
          function: {
            name: 'weather',
            arguments: '{"city":"Beijing"}'
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
      ]
    });
    mapper.emitEvent({
      ...toolResponse({
        id: 'call_weather',
        name: 'weather',
        response: 'compressed weather'
      })
    });
    mapper.emitEvent({
      ...toolResponse({
        id: 'call_time',
        name: 'time',
        response: 'compressed time'
      })
    });

    const restoredMessages = chats2GPTMessages({
      messages: [
        {
          obj: ChatRoleEnum.AI,
          value: mapper.assistantResponses
        }
      ],
      reserveId: false,
      reserveTool: true
    });

    expect(restoredMessages).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Checking both tools.',
        reasoning_content: 'Need weather and time.',
        tool_calls: [
          {
            id: 'call_weather',
            type: 'function',
            function: {
              name: 'weather',
              arguments: '{"city":"Beijing"}'
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
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_weather',
        content: 'compressed weather'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_time',
        content: 'compressed time'
      }
    ]);
  });

  it('recognizes agent loop control tools from injected tool names', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: () => ({
        name: '',
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set(['agent_update_plan', 'agent_ask']),
      updatePlanToolName: 'agent_update_plan',
      askToolName: 'agent_ask'
    });

    mapper.emitEvent({
      type: 'tool_call',
      call: {
        id: 'call_custom_plan',
        type: 'function',
        function: {
          name: 'agent_update_plan',
          arguments: '{"updates":['
        }
      }
    });
    mapper.emitEvent({
      type: 'tool_params',
      callId: 'call_custom_plan',
      argsDelta: ']}'
    });
    mapper.emitEvent({
      ...toolResponse({
        id: 'call_custom_plan',
        name: 'agent_update_plan',
        response: 'ok'
      })
    });

    expect(workflowStreamResponse).not.toHaveBeenCalled();
    expect(mapper.assistantResponses).toEqual([
      {
        id: 'call_custom_plan',
        agentPlanUpdate: {
          id: 'call_custom_plan',
          functionName: 'agent_update_plan',
          params: '{"updates":[]}',
          response: 'ok'
        }
      }
    ]);
  });

  it('stores stop gate feedback as an agent loop control value', () => {
    const mapper = createWorkflowAgentLoopEventMapper({
      getSubAppInfo: () => ({
        name: '',
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'stop_gate_feedback',
      id: 'stop_gate_1',
      reason: 'Active plan is not complete.',
      feedback: '<stop_gate_feedback>\nYou cannot finish yet.\n</stop_gate_feedback>',
      assistantText: 'too early',
      reasoningText: 'checking'
    });

    expect(mapper.assistantResponses).toEqual([
      {
        id: 'stop_gate_1',
        agentStopGate: {
          id: 'stop_gate_1',
          reason: 'Active plan is not complete.',
          feedback: '<stop_gate_feedback>\nYou cannot finish yet.\n</stop_gate_feedback>',
          assistantText: 'too early',
          reasoningText: 'checking'
        }
      }
    ]);
  });

  it('stores context checkpoint at the child LLM event position', () => {
    const mapper = createWorkflowAgentLoopEventMapper({
      getSubAppInfo: (id) => ({
        name: id,
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.emitEvent({
      type: 'after_message_compress',
      requestIds: ['req_compress'],
      seconds: 1,
      contextCheckpoint: '<context_checkpoint>compressed first chunk</context_checkpoint>'
    });
    mapper.emitEvent({
      type: 'tool_call',
      call: {
        id: 'call_search',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{}'
        }
      }
    });
    mapper.emitEvent({
      ...toolResponse({
        id: 'call_search',
        name: 'search',
        response: 'search result'
      })
    });

    expect(mapper.assistantResponses).toEqual([
      {
        contextCheckpoint: '<context_checkpoint>compressed first chunk</context_checkpoint>',
        hideInUI: true
      },
      {
        id: 'call_search',
        tools: [
          {
            id: 'call_search',
            toolName: 'search',
            toolAvatar: '',
            functionName: 'search',
            params: '{}',
            response: 'search result'
          }
        ]
      }
    ]);
  });

  it('restores the next turn from persisted checkpoint and later assistant values only', () => {
    const mapper = createWorkflowAgentLoopEventMapper({
      getSubAppInfo: (id) => ({
        name: id,
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });

    mapper.assistantResponses.push({
      text: {
        content: 'answer before checkpoint'
      }
    });
    mapper.emitEvent({
      type: 'after_message_compress',
      requestIds: ['req_compress'],
      seconds: 1.2,
      contextCheckpoint: '<context_checkpoint>compressed previous turn</context_checkpoint>'
    });
    mapper.assistantResponses.push({
      text: {
        content: 'answer after checkpoint'
      }
    });

    const persistedHistories = [
      {
        dataId: 'system',
        obj: ChatRoleEnum.System,
        value: [{ text: { content: 'system prompt' } }]
      },
      {
        dataId: 'older-user',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'older user question' } }]
      },
      {
        dataId: 'agent-response',
        obj: ChatRoleEnum.AI,
        value: mapper.assistantResponses
      },
      {
        dataId: 'next-user',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'next user question' } }]
      }
    ];

    const restoredMessages = chats2GPTMessages({
      messages: persistedHistories,
      reserveId: true,
      reserveTool: true
    });

    expect(mapper.assistantResponses).toEqual([
      {
        text: {
          content: 'answer before checkpoint'
        }
      },
      {
        contextCheckpoint: '<context_checkpoint>compressed previous turn</context_checkpoint>',
        hideInUI: true
      },
      {
        text: {
          content: 'answer after checkpoint'
        }
      }
    ]);
    expect(restoredMessages).toEqual([
      {
        dataId: 'system',
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        dataId: 'agent-response',
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: '<context_checkpoint>compressed previous turn</context_checkpoint>',
        hideInUI: true
      },
      {
        dataId: 'agent-response',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'answer after checkpoint'
      },
      {
        dataId: 'next-user',
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'next user question'
      }
    ]);
  });

  it('pushes plan updates into assistant responses and plan SSE', () => {
    const workflowStreamResponse = vi.fn();
    const mapper = createWorkflowAgentLoopEventMapper({
      workflowStreamResponse,
      getSubAppInfo: () => ({
        name: '',
        avatar: '',
        toolDescription: ''
      }),
      internalToolNames: new Set()
    });
    const plan = createPlan();

    mapper.emitEvent({
      type: 'plan_status',
      status: 'generating'
    });
    mapper.emitEvent({
      type: 'plan_update',
      plan
    });
    const updatedPlan = {
      ...plan,
      steps: [
        {
          ...plan.steps[0],
          status: 'done' as const,
          outputSummary: 'Read code'
        }
      ]
    };
    mapper.emitEvent({
      type: 'plan_update',
      plan: updatedPlan
    });

    expect(mapper.assistantResponses).toEqual([{ plan: updatedPlan }]);
    expect(workflowStreamResponse).toHaveBeenCalledTimes(3);
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(1, {
      id: 'agent-plan-stream',
      event: SseResponseEventEnum.planStatus,
      data: {
        planStatus: {
          status: 'generating'
        }
      }
    });
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(2, {
      id: 'agent-plan-stream',
      event: SseResponseEventEnum.plan,
      data: {
        plan
      }
    });
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(3, {
      id: 'agent-plan-stream',
      event: SseResponseEventEnum.plan,
      data: {
        plan: updatedPlan
      }
    });
  });
});
