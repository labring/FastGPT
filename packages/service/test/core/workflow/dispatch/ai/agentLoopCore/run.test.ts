import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import {
  runAgentLoopCore,
  runAgentLoopCoreWithSummary
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/run';
import { describe, expect, it, vi } from 'vitest';

const { runAgentLoopMock } = vi.hoisted(() => ({
  runAgentLoopMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/agentLoop/interface', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/ai/llm/agentLoop/interface')>();

  return {
    ...original,
    runAgentLoop: runAgentLoopMock
  };
});

describe('runAgentLoopCore', () => {
  it('uses events as the only assistantResponses source', async () => {
    runAgentLoopMock.mockResolvedValue({
      status: 'done',
      completeMessages: [],
      assistantMessages: [
        {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: 'answer'
        }
      ],
      requestIds: ['req_1'],
      finishReason: 'stop',
      usages: []
    });

    const result = await runAgentLoopCore({
      input: {
        messages: []
      },
      runtime: {
        llmParams: {
          model: 'gpt-4'
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn()
      } as any,
      assistantResponses: {
        extraResponses: [
          {
            id: 'extra',
            text: {
              content: 'extra'
            }
          }
        ]
      }
    });

    expect(result.assistantMessages).toHaveLength(1);
    expect(result.assistantResponses).toEqual([
      {
        id: 'extra',
        text: {
          content: 'extra'
        }
      }
    ]);
  });

  it('runs agent-loop and builds assistantResponses from standard events without transcript duplication', async () => {
    runAgentLoopMock.mockImplementation(async ({ runtime }) => {
      const call = {
        id: 'call_1',
        type: 'function',
        function: {
          name: 'search',
          arguments: '{"q":"hello"}'
        }
      };
      runtime.emitEvent({ type: 'tool_call', call });
      runtime.emitEvent({
        type: 'llm_request_end',
        requestIndex: 1,
        modelName: 'gpt-4',
        requestId: 'req_1',
        finishReason: 'tool_calls',
        answerText: 'answer',
        toolCalls: [call],
        seconds: 0.1
      });
      runtime.emitEvent({
        type: 'tool_run_end',
        call,
        rawResponse: 'tool result',
        response: 'tool result',
        seconds: 0.1
      });

      return {
        status: 'done',
        completeMessages: [],
        assistantMessages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            content: 'answer',
            tool_calls: [call]
          },
          {
            role: ChatCompletionRequestMessageRoleEnum.Tool,
            tool_call_id: 'call_1',
            content: 'tool result'
          }
        ],
        requestIds: ['req_1'],
        finishReason: 'stop',
        usages: []
      };
    });

    const runtime = {
      llmParams: {
        model: 'gpt-4'
      },
      toolCatalog: {
        runtimeTools: []
      },
      executeTool: vi.fn()
    } as any;
    const result = await runAgentLoopCore({
      provider: 'fastAgent',
      input: {
        messages: []
      },
      runtime,
      assistantResponses: {
        getEventToolInfo: () => ({
          name: 'Search',
          avatar: 'search-avatar'
        }),
        extraResponses: [
          {
            id: 'extra',
            text: {
              content: 'extra'
            }
          }
        ]
      }
    });

    expect(runAgentLoopMock).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'fastAgent',
        input: {
          messages: []
        },
        runtime: expect.objectContaining({
          llmParams: runtime.llmParams,
          toolCatalog: runtime.toolCatalog,
          executeTool: runtime.executeTool
        })
      })
    );
    expect(result.completeMessages).toEqual([]);
    expect(result.assistantResponses).toEqual([
      expect.objectContaining({
        id: 'extra',
        text: {
          content: 'extra'
        }
      }),
      expect.objectContaining({
        text: {
          content: 'answer'
        }
      }),
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            id: 'call_1',
            toolName: 'Search',
            toolAvatar: 'search-avatar',
            response: 'tool result'
          })
        ]
      })
    ]);
  });

  it('collects event assistantResponses before forwarding runtime events', async () => {
    const eventTarget: any[] = [];
    const forwardedEvents: any[] = [];

    runAgentLoopMock.mockImplementation(async ({ runtime }) => {
      runtime.emitEvent({
        type: 'answer_delta',
        text: 'hello'
      });
      runtime.emitEvent({
        type: 'tool_call',
        call: {
          id: 'call_search',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"q":"FastGPT"}'
          }
        }
      });
      runtime.emitEvent({
        type: 'tool_run_end',
        call: {
          id: 'call_search',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"q":"FastGPT"}'
          }
        },
        rawResponse: 'tool result',
        response: 'tool result',
        seconds: 0.1
      });
      runtime.emitEvent({
        type: 'plan_operation',
        operation: 'set_plan',
        success: true,
        message: 'plan created',
        id: 'call_plan',
        params: '{"action":"set_plan"}',
        plan: {
          planId: 'plan_1',
          name: 'Implementation plan',
          description: null,
          steps: [
            {
              id: 'step_1',
              name: 'Implement plan events',
              status: 'pending'
            }
          ]
        }
      });

      return {
        status: 'done',
        completeMessages: [],
        assistantMessages: [],
        requestIds: ['req_1'],
        finishReason: 'stop',
        usages: []
      };
    });

    const result = await runAgentLoopCore({
      input: {
        messages: []
      },
      runtime: {
        llmParams: {
          model: 'gpt-4'
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn(),
        emitEvent: (event) => {
          forwardedEvents.push(event);
        }
      } as any,
      assistantResponses: {
        eventTarget,
        getEventToolInfo: () => ({
          name: 'Search',
          avatar: 'search-avatar'
        }),
        metaEventNames: {
          updatePlanToolName: 'agent_update_plan'
        }
      }
    });

    expect(eventTarget).toEqual([
      {
        text: {
          content: 'hello'
        }
      },
      {
        id: 'call_search',
        tools: [
          {
            id: 'call_search',
            toolName: 'Search',
            toolAvatar: 'search-avatar',
            functionName: 'search',
            params: '{"q":"FastGPT"}',
            response: 'tool result'
          }
        ]
      },
      {
        plan: {
          planId: 'plan_1',
          name: 'Implementation plan',
          description: null,
          steps: [
            {
              id: 'step_1',
              name: 'Implement plan events',
              status: 'pending'
            }
          ]
        }
      },
      {
        id: 'call_plan',
        agentPlanUpdate: {
          id: 'call_plan',
          functionName: 'agent_update_plan',
          params: '{"action":"set_plan"}',
          response: 'plan created'
        }
      }
    ]);
    expect(forwardedEvents).toEqual([
      expect.objectContaining({
        type: 'answer_delta'
      }),
      expect.objectContaining({
        type: 'tool_call'
      }),
      expect.objectContaining({
        type: 'tool_run_end'
      }),
      expect.objectContaining({
        type: 'plan_operation',
        id: 'call_plan'
      })
    ]);
    expect(result.assistantResponses).toEqual(eventTarget);
  });

  it('maps low-level paused result to workflow core interactive status', async () => {
    const ask = {
      reason: 'Need confirmation',
      blockerType: 'missing_required_input' as const,
      question: 'Confirm?',
      options: ['Yes', 'No', 'Not sure']
    };
    runAgentLoopMock.mockResolvedValue({
      status: 'paused',
      pause: {
        type: 'ask',
        ask,
        askId: 'call_ask'
      },
      completeMessages: [],
      assistantMessages: [],
      requestIds: ['req_ask'],
      finishReason: 'stop',
      usages: []
    });

    const result = await runAgentLoopCore({
      input: {
        messages: []
      },
      runtime: {
        llmParams: {
          model: 'gpt-4'
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn()
      } as any
    });

    expect(result.status).toBe('interactive');
    expect(result.pause).toEqual({
      type: 'ask',
      ask,
      askId: 'call_ask'
    });
  });

  it('returns the core result and normalized summary together', async () => {
    runAgentLoopMock.mockResolvedValue({
      status: 'done',
      completeMessages: [],
      assistantMessages: [
        {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: 'answer'
        }
      ],
      requestIds: ['req_summary'],
      finishReason: 'stop',
      usages: [
        {
          moduleName: 'account_usage:agent_call',
          inputTokens: 3,
          outputTokens: 2,
          totalPoints: 0.5
        }
      ]
    });

    const { result, summary } = await runAgentLoopCoreWithSummary({
      input: {
        messages: []
      },
      runtime: {
        llmParams: {
          model: 'gpt-4'
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn()
      } as any
    });

    expect(result.status).toBe('done');
    expect(summary).toEqual(
      expect.objectContaining({
        status: 'done',
        requestIds: ['req_summary'],
        inputTokens: 3,
        outputTokens: 2,
        llmTotalPoints: 0.5,
        finalText: 'answer'
      })
    );
  });
});
