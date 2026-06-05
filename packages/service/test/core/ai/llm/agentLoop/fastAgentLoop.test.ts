import {
  ChatCompletionRequestMessageRoleEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockCreateLLMResponseQueue, text, toolCall } from './_mocks/llmQueue';

const {
  createLLMResponseMock,
  compressRequestMessagesMock,
  compressToolResponseMock,
  runSandboxToolsMock
} = vi.hoisted(() => ({
  createLLMResponseMock: vi.fn(),
  compressRequestMessagesMock: vi.fn(),
  compressToolResponseMock: vi.fn(),
  runSandboxToolsMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/request', () => ({
  createLLMResponse: createLLMResponseMock
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: vi.fn(
    (): LLMModelItemType => ({
      type: ModelTypeEnum.llm,
      provider: 'openai',
      model: 'gpt-4',
      name: 'GPT-4',
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 60000,
      functionCall: true,
      toolChoice: true,
      reasoning: false
    })
  )
}));

vi.mock('@fastgpt/service/core/ai/llm/compress', () => ({
  compressRequestMessages: compressRequestMessagesMock,
  compressToolResponse: compressToolResponseMock
}));

vi.mock('@fastgpt/service/core/ai/llm/utils', () => ({
  filterGPTMessageByMaxContext: vi.fn(async ({ messages }) => messages)
}));

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: vi.fn(async () => 100)
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: vi.fn(() => ({
    totalPoints: 1
  }))
}));

vi.mock('@fastgpt/service/core/ai/sandbox/toolCall', () => ({
  runSandboxTools: runSandboxToolsMock,
  getSandboxToolInfo: vi.fn(() => ({
    name: 'Sandbox',
    avatar: 'sandbox-avatar'
  }))
}));

import {
  createAskUserAgentTool,
  createUpdatePlanAgentTool,
  createAgentLoopSandboxTools
} from '@fastgpt/service/core/ai/llm/agentLoop/systemTools';
import {
  runFastAgentMainLoop,
  type AgentLoopRuntime
} from '@fastgpt/service/core/ai/llm/agentLoop/providers/fastAgent/loop';

const findPlanStepIdByName = (messages: any[], name: string) => {
  const content = messages
    .map((message) => (message.role === 'tool' ? message.content : ''))
    .join('\n');
  const matched = content.match(
    new RegExp(`- ([^:\\n]+): ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
  );
  if (!matched) {
    throw new Error(`Plan step id not found for ${name}`);
  }
  return matched[1];
};

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

const createRuntime = (overrides?: Partial<AgentLoopRuntime>): AgentLoopRuntime => ({
  model: 'gpt-4',
  stream: true,
  maxStopGateRejections: 2,
  toolCatalog: {
    runtimeTools: [tool('search')],
    askTool: createAskUserAgentTool(),
    updatePlanTool: createUpdatePlanAgentTool()
  },
  executeTool: vi.fn(async () => ({
    response: 'runtime tool response',
    assistantMessages: [],
    usages: []
  })),
  ...overrides
});

describe('runFastAgentMainLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compressRequestMessagesMock.mockImplementation(async ({ messages }) => ({
      messages
    }));
    compressToolResponseMock.mockImplementation(async ({ response }) => ({
      compressed: response
    }));
  });

  it('returns done when main agent answers directly without plan', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({
        requestId: 'req_direct',
        content: 'direct answer',
        reasoning: 'direct reasoning'
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime(),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'hello'
          }
        ]
      }
    });

    expect(result.status).toBe('done');
    expect(result.answerText).toBe('direct answer');
    expect(result.reasoningText).toBe('direct reasoning');
    expect(result.activePlan).toBeUndefined();
    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(createLLMResponseMock.mock.calls[0][0].body.messages[0].content).toContain(
      '你是 FastGPT Main Agent'
    );
  });

  it('passes context checkpoint from base loop to fastAgent result', async () => {
    const contextCheckpoint = '<context_checkpoint>compressed history</context_checkpoint>';

    compressRequestMessagesMock.mockImplementation(async ({ messages }) => ({
      messages,
      usage: {
        moduleName: 'account_usage:compress_llm_messages',
        model: 'GPT-4',
        totalPoints: 0,
        inputTokens: 20,
        outputTokens: 8
      },
      requestIds: ['req_compress'],
      contextCheckpoint
    }));
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({
        requestId: 'req_direct',
        content: 'direct answer'
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime(),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'hello'
          }
        ]
      }
    });

    expect(result.status).toBe('done');
    expect(result.contextCheckpoint).toEqual(contextCheckpoint);
  });

  it('passes reasoning effort to the LLM request body', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({
        requestId: 'req_reasoning_effort',
        content: 'direct answer'
      })
    ]);

    await runFastAgentMainLoop({
      runtime: createRuntime({
        reasoningEffort: 'high'
      }),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'hello'
          }
        ]
      }
    });

    expect(createLLMResponseMock.mock.calls[0][0].body.reasoning_effort).toBe('high');
  });

  it('runs sandbox internal tools and emits regular runtime tool events', async () => {
    const events: unknown[] = [];
    runSandboxToolsMock.mockResolvedValue({
      success: true,
      input: {
        command: 'pwd'
      },
      response: 'sandbox output',
      durationSeconds: 0.1
    });
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_sandbox',
        name: 'sandbox_shell',
        args: {
          command: 'pwd'
        }
      }),
      text({
        requestId: 'req_after_sandbox',
        content: 'done'
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime({
        toolCatalog: {
          runtimeTools: [],
          sandboxTools: createAgentLoopSandboxTools()
        },
        sandboxToolContext: {
          client: {} as any
        },
        emitEvent: (event) => events.push(event)
      }),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'run pwd in sandbox'
          }
        ]
      }
    });

    expect(result.status).toBe('done');
    expect(result.answerText).toBe('done');
    expect(runSandboxToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'sandbox_shell',
        args: '{"command":"pwd"}',
        sandboxClient: expect.anything()
      })
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_call',
          call: expect.objectContaining({
            id: 'call_sandbox'
          })
        }),
        expect.objectContaining({
          type: 'tool_run_end',
          call: expect.objectContaining({
            id: 'call_sandbox'
          }),
          response: 'sandbox output',
          nodeResponse: expect.objectContaining({
            toolId: 'sandbox_shell',
            toolRes: 'sandbox output'
          })
        })
      ])
    );
  });

  it('skips tool response compression for update_plan', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_update_plan',
        name: 'update_plan',
        args: {}
      }),
      text({
        requestId: 'req_after_plan',
        content: 'final after plan'
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime(),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'Need a plan'
          }
        ]
      }
    });

    expect(result.status).toBe('done');
    expect(compressToolResponseMock).not.toHaveBeenCalled();
  });

  it('uses update_plan and stop gate feedback in one main loop', async () => {
    const events: unknown[] = [];

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      {
        ...toolCall({
          id: 'call_set_plan',
          name: 'update_plan',
          args: {
            action: 'set_plan',
            name: 'Compare products',
            description: 'Compare FastGPT and Dify',
            steps: [
              {
                name: 'Compare positioning',
                description: 'Compare product positioning'
              },
              {
                name: 'Compare workflow',
                description: 'Compare workflow and agent capabilities'
              }
            ]
          }
        }),
        answerText: 'draft before plan tool'
      },
      text({
        requestId: 'req_too_early',
        content: 'final too early'
      }),
      ({ body }) =>
        toolCall({
          id: 'call_done_s1',
          name: 'update_plan',
          args: {
            action: 'update_steps',
            steps: [
              {
                id: findPlanStepIdByName(body.messages, 'Compare positioning'),
                status: 'done',
                note: 'FastGPT is RAG-focused; Dify is broader.'
              },
              {
                id: findPlanStepIdByName(body.messages, 'Compare workflow'),
                status: 'done',
                note: 'Dify has broader workflow and agent orchestration.'
              }
            ]
          }
        }),
      text({
        requestId: 'req_final',
        content: 'final comparison'
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime({
        emitEvent: (event) => events.push(event)
      }),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'Compare FastGPT and Dify'
          }
        ]
      }
    });

    expect(result.status).toBe('done');
    expect(result.answerText).toBe('final comparison');
    expect(result.activePlan?.steps[0]).toMatchObject({
      name: 'Compare positioning',
      status: 'done',
      note: 'FastGPT is RAG-focused; Dify is broader.'
    });
    expect(result.activePlan?.steps[1]).toMatchObject({
      name: 'Compare workflow',
      status: 'done',
      note: 'Dify has broader workflow and agent orchestration.'
    });
    expect(createLLMResponseMock).toHaveBeenCalledTimes(4);
    expect(createLLMResponseMock.mock.calls[2][0].body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('stop_gate_feedback')
        })
      ])
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'llm_request_start',
          requestIndex: 1,
          modelName: 'GPT-4'
        }),
        expect.objectContaining({
          type: 'llm_request_end',
          requestIndex: 4,
          requestId: 'req_final',
          finishReason: 'stop'
        }),
        expect.objectContaining({
          type: 'llm_request_end',
          requestIndex: 1,
          requestId: 'req_call_set_plan',
          finishReason: 'tool_calls'
        }),
        expect.objectContaining({
          type: 'plan_status',
          status: 'generating'
        }),
        expect.objectContaining({
          type: 'plan_update',
          plan: expect.objectContaining({
            name: 'Compare products'
          })
        }),
        expect.objectContaining({
          type: 'plan_update',
          plan: expect.objectContaining({
            name: 'Compare products',
            steps: expect.arrayContaining([
              expect.objectContaining({
                name: 'Compare positioning',
                status: 'done'
              }),
              expect.objectContaining({
                name: 'Compare workflow',
                status: 'done'
              })
            ])
          })
        }),
        expect.objectContaining({
          type: 'assistant_push',
          value: expect.objectContaining({
            id: 'stop_gate_2_req_too_early',
            agentStopGate: expect.objectContaining({
              id: 'stop_gate_2_req_too_early',
              feedback: expect.stringContaining('stop_gate_feedback')
            }),
            hideInUI: true
          })
        })
      ])
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'answer_delta',
        text: 'final too early'
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'answer_delta',
        text: 'draft before plan tool'
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'answer_delta',
        text: 'final comparison'
      })
    );
  });

  it('forces update_plan when the user explicitly asks for plan mode', async () => {
    const events: unknown[] = [];

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({
        requestId: 'req_too_early',
        content: '流式计划测试完成。'
      }),
      toolCall({
        id: 'call_set_plan',
        name: 'update_plan',
        args: {
          action: 'set_plan',
          name: '流式输出测试',
          description: '创建两步计划并逐步完成。',
          steps: [
            {
              name: '准备测试',
              description: '把准备测试标记为执行中并完成。'
            },
            {
              name: '完成测试',
              description: '把完成测试标记为执行中并完成。'
            }
          ]
        }
      }),
      ({ body }) =>
        toolCall({
          id: 'call_finish_plan',
          name: 'update_plan',
          args: {
            action: 'update_steps',
            steps: [
              {
                id: findPlanStepIdByName(body.messages, '准备测试'),
                status: 'done',
                note: '准备测试已完成。'
              },
              {
                id: findPlanStepIdByName(body.messages, '完成测试'),
                status: 'done',
                note: '完成测试已完成。'
              }
            ]
          }
        }),
      text({
        requestId: 'req_final',
        content: '流式计划测试完成。'
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime({
        emitEvent: (event) => events.push(event)
      }),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content:
              '请用 AgentV2 计划模式做一个流式输出测试：创建 2 步计划；第一步把“准备测试”标记为执行中然后完成；第二步把“完成测试”标记为执行中然后完成。不要调用任何外部工具。每一步完成时更新计划。最后只输出：流式计划测试完成。'
          }
        ]
      }
    });

    expect(result.status).toBe('done');
    expect(result.answerText).toBe('流式计划测试完成。');
    expect(result.activePlan?.steps.map((step) => step.status)).toEqual(['done', 'done']);
    expect(createLLMResponseMock).toHaveBeenCalledTimes(4);
    expect(createLLMResponseMock.mock.calls[1][0].body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('explicitly requested a plan')
        })
      ])
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'plan_update',
          plan: expect.objectContaining({
            name: '流式输出测试'
          })
        }),
        expect.objectContaining({
          type: 'plan_update',
          plan: expect.objectContaining({
            name: '流式输出测试',
            steps: expect.arrayContaining([
              expect.objectContaining({
                name: '准备测试',
                status: 'done'
              }),
              expect.objectContaining({
                name: '完成测试',
                status: 'done'
              })
            ])
          })
        })
      ])
    );
    expect(
      events.filter(
        (event) =>
          typeof event === 'object' &&
          event !== null &&
          'type' in event &&
          event.type === 'answer_delta' &&
          'text' in event &&
          event.text === '流式计划测试完成。'
      )
    ).toHaveLength(2);
  });

  it('streams final answer live and disables tools when active plan is already complete', async () => {
    const events: unknown[] = [];
    const activePlan = {
      planId: 'plan_done',
      name: '完成计划后回答',
      description: '计划已经完成，下一轮只能最终回答。',
      steps: [
        {
          id: 's1',
          name: '完成准备',
          description: '准备工作已完成。',
          status: 'done' as const,
          note: '准备完成。'
        }
      ]
    };

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({
        requestId: 'req_final',
        content: '最终流式回答'
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime({
        emitEvent: (event) => events.push(event)
      }),
      input: {
        activePlan,
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: '给出最终回答'
          }
        ]
      }
    });

    expect(result.status).toBe('done');
    expect(result.answerText).toBe('最终流式回答');
    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(createLLMResponseMock.mock.calls[0][0].body.tool_choice).toBe('none');
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'answer_delta',
        text: '最终流式回答'
      })
    );
  });

  it('rejects final answer when a runtime tool result was not recorded into the active plan', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_set_plan',
        name: 'update_plan',
        args: {
          action: 'set_plan',
          name: 'Research docs',
          description: 'Research docs',
          steps: [
            {
              name: 'Collect evidence',
              description: 'Collect evidence'
            }
          ]
        }
      }),
      ({ body }) =>
        toolCall({
          id: 'call_done',
          name: 'update_plan',
          args: {
            action: 'update_steps',
            steps: [
              {
                id: findPlanStepIdByName(body.messages, 'Collect evidence'),
                status: 'done',
                note: 'Initial evidence collected.'
              }
            ]
          }
        }),
      toolCall({
        id: 'call_search',
        name: 'search',
        args: {
          q: 'latest evidence'
        }
      }),
      text({
        requestId: 'req_too_early',
        content: 'final without recording tool result'
      }),
      ({ body }) =>
        toolCall({
          id: 'call_record_tool',
          name: 'update_plan',
          args: {
            action: 'update_steps',
            steps: [
              {
                id: findPlanStepIdByName(body.messages, 'Collect evidence'),
                status: 'done',
                note: 'Initial evidence and latest evidence collected. Recorded runtime tool result.'
              }
            ]
          }
        }),
      text({
        requestId: 'req_final',
        content: 'final with recorded tool result'
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime(),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'Research docs'
          }
        ]
      }
    });

    expect(result.status).toBe('done');
    expect(result.answerText).toBe('final with recorded tool result');
    expect(createLLMResponseMock).toHaveBeenCalledTimes(6);
    expect(createLLMResponseMock.mock.calls[4][0].body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('recent runtime tool results')
        })
      ])
    );
    expect(result.activePlan?.steps[0].note).toContain('Recorded runtime tool result.');
  });

  it('returns ask with pending main context when ask_agent is called', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_ask',
        name: 'ask_user',
        args: {
          reason: 'Need private repository path',
          blockerType: 'missing_required_input',
          question: 'Which repository should I inspect?',
          options: [
            'Use the current workspace',
            'I will provide a repository path',
            'Skip repository inspection'
          ]
        }
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime(),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'Inspect repository'
          }
        ]
      }
    });

    expect(result.status).toBe('ask');
    expect(result.ask?.question).toBe('Which repository should I inspect?');
    expect(result.ask?.options).toEqual([
      'Use the current workspace',
      'I will provide a repository path',
      'Skip repository inspection'
    ]);
    expect(result.pendingMainContext?.askToolCallId).toBe('call_ask');
    expect(result.pendingMainContext?.messages.at(-1)).toEqual({
      role: 'assistant',
      tool_calls: [
        {
          id: 'call_ask',
          type: 'function',
          function: {
            name: 'ask_user',
            arguments:
              '{"reason":"Need private repository path","blockerType":"missing_required_input","question":"Which repository should I inspect?","options":["Use the current workspace","I will provide a repository path","Skip repository inspection"]}'
          }
        }
      ]
    });
    expect(compressToolResponseMock).not.toHaveBeenCalled();
  });

  it('continues the loop instead of returning an empty answer for invalid ask_agent args', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_bad_ask',
        name: 'ask_user',
        args: {
          reason: 'Missing required question',
          blockerType: 'ambiguous_goal'
        }
      }),
      text({
        requestId: 'req_after_bad_ask',
        content: 'Recovered after invalid ask args.'
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime(),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'Try asking with malformed args'
          }
        ]
      }
    });

    expect(result.status).toBe('done');
    expect(result.answerText).toBe('Recovered after invalid ask args.');
    expect(createLLMResponseMock).toHaveBeenCalledTimes(2);
  });

  it('keeps runtime-tool plan-update requirements across ask_agent resume', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_set_plan',
        name: 'update_plan',
        args: {
          action: 'set_plan',
          name: 'Research before asking',
          description: 'Research then ask the user',
          steps: [
            {
              name: 'Collect evidence',
              description: 'Collect evidence before asking'
            }
          ]
        }
      }),
      ({ body }) =>
        toolCall({
          id: 'call_done',
          name: 'update_plan',
          args: {
            action: 'update_steps',
            steps: [
              {
                id: findPlanStepIdByName(body.messages, 'Collect evidence'),
                status: 'done',
                note: 'Initial evidence collected.'
              }
            ]
          }
        }),
      toolCall({
        id: 'call_search',
        name: 'search',
        args: {
          q: 'latest evidence'
        }
      }),
      toolCall({
        id: 'call_ask',
        name: 'ask_user',
        args: {
          reason: 'Need user confirmation',
          blockerType: 'missing_required_input',
          question: 'Should I include the latest evidence?',
          options: [
            'Include the latest evidence',
            'Use only the existing evidence',
            'Ask me for a specific evidence source'
          ]
        }
      }),
      text({
        requestId: 'req_too_early_after_resume',
        content: 'final too early after resume'
      }),
      ({ body }) =>
        toolCall({
          id: 'call_record_tool',
          name: 'update_plan',
          args: {
            action: 'update_steps',
            steps: [
              {
                id: findPlanStepIdByName(body.messages, 'Collect evidence'),
                status: 'done',
                note: 'Initial and latest evidence collected. Recorded latest evidence after user confirmation.'
              }
            ]
          }
        }),
      text({
        requestId: 'req_final_after_resume',
        content: 'final after resume'
      })
    ]);

    const firstResult = await runFastAgentMainLoop({
      runtime: createRuntime(),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'Research and ask if needed'
          }
        ]
      }
    });

    expect(firstResult.status).toBe('ask');
    expect(firstResult.pendingMainContext?.runtimeToolCalledSinceLastPlanUpdate).toBe(true);

    const resumedResult = await runFastAgentMainLoop({
      runtime: createRuntime(),
      input: {
        messages: [],
        pendingMainContext: firstResult.pendingMainContext,
        userAnswer: 'Yes, include it.'
      }
    });

    expect(resumedResult.status).toBe('done');
    expect(resumedResult.answerText).toBe('final after resume');
    expect(createLLMResponseMock).toHaveBeenCalledTimes(7);
    expect(createLLMResponseMock.mock.calls[5][0].body.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('recent runtime tool results')
        })
      ])
    );
  });
});
