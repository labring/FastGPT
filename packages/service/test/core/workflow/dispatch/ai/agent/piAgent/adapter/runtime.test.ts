import { describe, expect, it, vi } from 'vitest';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import {
  createPiAgentWorkflowRuntime,
  normalizePiAgentMessages
} from '@fastgpt/service/core/workflow/dispatch/ai/agent/piAgent/adapter/runtime';

const createProps = (overrides = {}) =>
  ({
    node: {
      nodeId: 'agent_node',
      flowNodeType: FlowNodeTypeEnum.agent
    },
    params: {
      model: 'gpt-4'
    },
    externalProvider: {
      openaiAccount: { key: 'user-key' }
    },
    ...overrides
  }) as any;

const usage = {
  input: 10,
  output: 5,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 15,
  cost: {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0
  }
};

const createTool = ({
  name,
  properties,
  required
}: {
  name: string;
  properties: Record<string, unknown>;
  required: string[];
}) =>
  ({
    type: 'function',
    function: {
      name,
      description: `${name} description`,
      parameters: {
        type: 'object',
        properties,
        required
      }
    }
  }) as any;

describe('PiAgent workflow runtime', () => {
  it('keeps tool node responses flat after an agent response', () => {
    const nodeResponses: any[] = [];
    const saveLLMRequestRecordFn = vi.fn();
    const runtime = createPiAgentWorkflowRuntime({
      props: createProps(),
      nodeResponses,
      usagePush: vi.fn(),
      saveLLMRequestRecordFn
    });

    runtime.onPayload({ messages: [] }, { name: 'GPT-4' } as any);
    runtime.handleAgentEvent({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: 'answer' }],
        usage,
        stopReason: 'stop',
        responseId: 'provider_resp_1'
      }
    } as any);
    runtime.appendChildNodeResponse({
      id: 'call_tool',
      nodeId: 'call_tool',
      moduleType: FlowNodeTypeEnum.tool,
      moduleName: 'Tool'
    } as any);

    expect(nodeResponses).toEqual([
      expect.objectContaining({
        moduleName: 'chat:master_agent_call',
        textOutput: 'answer'
      }),
      expect.objectContaining({
        id: 'call_tool',
        nodeId: 'call_tool',
        moduleName: 'Tool'
      })
    ]);
    expect(nodeResponses[0].childrenResponses).toBeUndefined();
    expect(saveLLMRequestRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        response: expect.objectContaining({
          providerResponseId: 'provider_resp_1',
          usage: expect.not.objectContaining({
            usedUserOpenAIKey: expect.anything()
          })
        })
      })
    );
  });

  it('merges split tool call argument blocks before persisting agent context', () => {
    const nodeResponses: any[] = [];
    const saveLLMRequestRecordFn = vi.fn();
    const runtime = createPiAgentWorkflowRuntime({
      props: createProps(),
      nodeResponses,
      usagePush: vi.fn(),
      saveLLMRequestRecordFn,
      completionTools: [
        createTool({
          name: 'sandbox_shell',
          properties: {
            command: { type: 'string' },
            timeout: { type: 'number' }
          },
          required: ['command']
        }),
        createTool({
          name: 'tmetaso0',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        })
      ]
    });
    const message = {
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          id: 'call_shell',
          name: 'sandbox_shell',
          arguments: {}
        },
        {
          type: 'toolCall',
          id: 'call_search',
          name: 'tmetaso0',
          arguments: {}
        },
        {
          type: 'toolCall',
          id: 'ghost_search_args',
          name: '',
          arguments: {
            query: 'FastGPT V4.13 update notes'
          }
        },
        {
          type: 'toolCall',
          id: 'ghost_shell_command',
          name: '',
          arguments: {
            command: 'printf PI_TOOL_CALLBACK_OK'
          }
        },
        {
          type: 'toolCall',
          id: 'ghost_shell_timeout',
          name: '',
          arguments: {
            timeout: 60
          }
        }
      ],
      usage,
      stopReason: 'toolUse',
      responseId: 'provider_resp_tool'
    } as any;

    runtime.onPayload({ messages: [] }, { name: 'GPT-4' } as any);
    runtime.handleAgentEvent({
      type: 'message_end',
      message
    } as any);

    expect(message.content).toEqual([
      {
        type: 'toolCall',
        id: 'call_shell',
        name: 'sandbox_shell',
        arguments: {
          command: 'printf PI_TOOL_CALLBACK_OK',
          timeout: 60
        }
      },
      {
        type: 'toolCall',
        id: 'call_search',
        name: 'tmetaso0',
        arguments: {
          query: 'FastGPT V4.13 update notes'
        }
      }
    ]);
    expect(saveLLMRequestRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        response: expect.objectContaining({
          toolCalls: [
            {
              id: 'call_shell',
              type: 'function',
              function: {
                name: 'sandbox_shell',
                arguments: '{"command":"printf PI_TOOL_CALLBACK_OK","timeout":60}'
              }
            },
            {
              id: 'call_search',
              type: 'function',
              function: {
                name: 'tmetaso0',
                arguments: '{"query":"FastGPT V4.13 update notes"}'
              }
            }
          ]
        })
      })
    );
    expect(nodeResponses).toEqual([
      expect.objectContaining({
        finishReason: 'tool_calls',
        textOutput: ''
      })
    ]);
  });

  it('hides reasoning from stream and node response while preserving stored reasoning', () => {
    const nodeResponses: any[] = [];
    const workflowStreamResponse = vi.fn();
    const saveLLMRequestRecordFn = vi.fn();
    const runtime = createPiAgentWorkflowRuntime({
      props: createProps({
        params: {
          model: 'gpt-4',
          aiChatReasoning: false
        }
      }),
      nodeResponses,
      workflowStreamResponse,
      usagePush: vi.fn(),
      saveLLMRequestRecordFn
    });

    runtime.onPayload({ messages: [] }, { name: 'GPT-4' } as any);
    runtime.handleAgentEvent({
      type: 'message_update',
      assistantMessageEvent: {
        type: 'thinking_delta',
        delta: 'hidden thought'
      }
    } as any);
    runtime.handleAgentEvent({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'hidden thought' },
          { type: 'text', text: 'answer' }
        ],
        usage,
        stopReason: 'stop'
      }
    } as any);

    expect(runtime.getReasoningText()).toBe('hidden thought');
    expect(workflowStreamResponse).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          reasoning_content: expect.any(String)
        })
      })
    );
    expect(nodeResponses[0]).toEqual(
      expect.objectContaining({
        textOutput: 'answer'
      })
    );
    expect(nodeResponses[0].reasoningText).toBeUndefined();
    expect(saveLLMRequestRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        response: expect.objectContaining({
          reasoningText: 'hidden thought'
        })
      })
    );
  });

  it('normalizes restored pi messages before they are converted to LLM context', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          {
            type: 'toolCall',
            id: 'call_shell',
            name: 'sandbox_shell',
            arguments: {}
          },
          {
            type: 'toolCall',
            id: 'ghost_shell_args',
            name: '',
            arguments: {
              command: 'printf PI_TOOL_CALLBACK_OK'
            }
          }
        ],
        usage,
        stopReason: 'toolUse'
      }
    ] as any[];

    const normalized = normalizePiAgentMessages({
      messages,
      completionTools: [
        createTool({
          name: 'sandbox_shell',
          properties: {
            command: { type: 'string' }
          },
          required: ['command']
        })
      ]
    });

    expect((normalized[0] as any).content).toEqual([
      {
        type: 'toolCall',
        id: 'call_shell',
        name: 'sandbox_shell',
        arguments: {
          command: 'printf PI_TOOL_CALLBACK_OK'
        }
      }
    ]);
    expect(messages[0].content).toHaveLength(2);
  });

  it('keeps every master agent request response, including empty and failed runs', () => {
    const nodeResponses: any[] = [];
    const saveLLMRequestRecordFn = vi.fn();
    const runtime = createPiAgentWorkflowRuntime({
      props: createProps(),
      nodeResponses,
      usagePush: vi.fn(),
      saveLLMRequestRecordFn
    });

    runtime.onPayload({ messages: ['empty start'] }, { name: 'GPT-4' } as any);
    runtime.handleAgentEvent({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [],
        usage,
        stopReason: 'stop'
      }
    } as any);

    runtime.onPayload({ messages: ['failed request'] }, { name: 'GPT-4' } as any);
    runtime.appendPendingAgentError('provider failed');

    runtime.onPayload({ messages: ['empty end'] }, { name: 'GPT-4' } as any);
    runtime.handleAgentEvent({
      type: 'message_end',
      message: {
        role: 'assistant',
        content: [],
        usage,
        stopReason: 'aborted'
      }
    } as any);

    expect(nodeResponses).toHaveLength(3);
    expect(nodeResponses).toEqual([
      expect.objectContaining({
        moduleName: 'chat:master_agent_call',
        finishReason: 'stop',
        textOutput: '',
        llmRequestIds: [expect.any(String)]
      }),
      expect.objectContaining({
        moduleName: 'chat:master_agent_call',
        finishReason: 'error',
        errorText: 'provider failed',
        llmRequestIds: [expect.any(String)]
      }),
      expect.objectContaining({
        moduleName: 'chat:master_agent_call',
        finishReason: 'close',
        textOutput: '',
        llmRequestIds: [expect.any(String)]
      })
    ]);
    expect(saveLLMRequestRecordFn).toHaveBeenCalledWith(
      expect.objectContaining({
        response: expect.objectContaining({
          finish_reason: 'error',
          error: 'provider failed'
        })
      })
    );
  });
});
