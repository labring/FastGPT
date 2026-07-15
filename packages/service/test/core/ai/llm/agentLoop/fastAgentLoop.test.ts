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

vi.mock('@fastgpt/service/core/ai/sandbox/interface/toolCall', () => ({
  runSandboxTools: runSandboxToolsMock,
  getSandboxToolInfo: vi.fn(() => ({
    name: 'Sandbox',
    avatar: 'sandbox-avatar'
  }))
}));

import {
  createAskUserAgentTool,
  createSetPlanAgentTool,
  createUpdatePlanAgentTool
} from '@fastgpt/service/core/ai/llm/agentLoop/interface';
import { createAgentLoopSandboxTools } from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/sandbox';
import {
  runFastAgentMainLoop,
  type AgentLoopRuntime
} from '@fastgpt/service/core/ai/llm/agentLoop/provider/fastAgent/loop';

const getFinalAssistantText = (result: { assistantMessages: any[] }) =>
  result.assistantMessages
    .filter((message) => message.role === ChatCompletionRequestMessageRoleEnum.Assistant)
    .filter((message) => !message.tool_calls?.length)
    .map((message) => message.content || '')
    .join('');

const getFinalAssistantReasoning = (result: { assistantMessages: any[] }) =>
  result.assistantMessages
    .filter((message) => message.role === ChatCompletionRequestMessageRoleEnum.Assistant)
    .filter((message) => !message.tool_calls?.length)
    .map((message) => message.reasoning_content || '')
    .join('');

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
  teamId: 'team-1',
  model: 'gpt-4',
  stream: true,
  toolCatalog: {
    runtimeTools: [tool('search')],
    askTool: createAskUserAgentTool(),
    setPlanTool: createSetPlanAgentTool(),
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
    expect(getFinalAssistantText(result)).toBe('direct answer');
    expect(getFinalAssistantReasoning(result)).toBe('direct reasoning');
    expect(result.activePlan).toBeUndefined();
    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    const mainAgentPrompt = createLLMResponseMock.mock.calls[0][0].body.messages[0].content;
    expect(mainAgentPrompt).toContain('你是 Work Agent');
    expect(mainAgentPrompt).toContain('任务或 Skill 明确需要通过选项向用户收集信息');
    expect(mainAgentPrompt).toContain('Skill 要求向用户收集选项信息时');
    expect(mainAgentPrompt).toContain('options：2 到 5 个');
  });

  it('creates an active plan through set_plan', async () => {
    const events: any[] = [];
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_set_plan',
        name: 'set_plan',
        args: {
          name: 'Implementation plan',
          steps: ['Inspect code', 'Run tests']
        }
      }),
      text({
        requestId: 'req_after_set_plan',
        content: 'plan created'
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
            content: 'Create an implementation plan'
          }
        ]
      }
    });

    expect(result.activePlan).toMatchObject({
      name: 'Implementation plan',
      steps: [
        expect.objectContaining({ name: 'Inspect code', status: 'pending' }),
        expect.objectContaining({ name: 'Run tests', status: 'pending' })
      ]
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'plan_operation',
        operation: 'set_plan',
        success: true,
        id: 'call_set_plan'
      })
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
    expect(getFinalAssistantText(result)).toBe('done');
    expect(runSandboxToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team-1',
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
          response: 'sandbox output'
        })
      ])
    );
  });

  it.each([
    {
      name: 'set_plan',
      args: { name: 'Implementation plan', steps: ['Inspect code'] }
    },
    {
      name: 'update_plan',
      args: { add_steps: ['Run tests'] }
    }
  ])('skips tool response compression for $name', async ({ name, args }) => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: `call_${name}`,
        name,
        args
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

  it('streams final answer live without plan-based tool restrictions', async () => {
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
    expect(getFinalAssistantText(result)).toBe('最终流式回答');
    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(createLLMResponseMock.mock.calls[0][0].body.tool_choice).toBe('auto');
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'answer_delta',
        text: '最终流式回答'
      })
    );
  });

  it('returns ask with pending main context when ask_agent is called', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_ask',
        name: 'ask_user',
        reasoning: 'Need to ask before planning can continue.',
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

    expect(result.status).toBe('paused');
    expect(result.pause?.type).toBe('ask');
    expect(result.pause?.type === 'ask' ? result.pause.ask.question : undefined).toBe(
      'Which repository should I inspect?'
    );
    expect(result.pause?.type === 'ask' ? result.pause.ask.options : undefined).toEqual([
      'Use the current workspace',
      'I will provide a repository path',
      'Skip repository inspection'
    ]);
    expect(result.pendingMainContext?.askToolCallId).toBe('call_ask');
    expect(result.pendingMainContext?.messages.at(-1)).toEqual({
      role: 'assistant',
      reasoning_content: 'Need to ask before planning can continue.',
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

  it('does not run later tools after ask_user pauses the loop', async () => {
    const executeTool = vi.fn(async () => ({
      response: 'should not run',
      assistantMessages: [],
      usages: []
    }));

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      {
        requestId: 'req_ask_before_tool',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call_ask_first',
            type: 'function',
            function: {
              name: 'ask_user',
              arguments: JSON.stringify({
                reason: 'Need confirmation before changing data',
                blockerType: 'missing_required_input',
                question: 'Should I continue with the data change?',
                options: ['Continue', 'Cancel', 'Review the proposed change first']
              })
            }
          },
          {
            id: 'call_search_after_ask',
            type: 'function',
            function: {
              name: 'search',
              arguments: JSON.stringify({ q: 'must not execute before the answer' })
            }
          }
        ],
        inputTokens: 100,
        outputTokens: 20
      }
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime({ executeTool }),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'Ask before changing anything'
          }
        ]
      }
    });

    expect(result.status).toBe('paused');
    expect(result.pause).toEqual(
      expect.objectContaining({
        type: 'ask',
        askId: 'call_ask_first'
      })
    );
    expect(executeTool).not.toHaveBeenCalled();
    expect(result.assistantMessages).not.toContainEqual(
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'call_search_after_ask'
      })
    );
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
    expect(getFinalAssistantText(result)).toBe('Recovered after invalid ask args.');
    expect(createLLMResponseMock).toHaveBeenCalledTimes(2);
  });

  it('normalizes empty ask_agent resume answer to none in tool message', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({
        requestId: 'req_after_resume',
        content: 'continued after empty answer'
      })
    ]);

    await runFastAgentMainLoop({
      runtime: createRuntime(),
      input: {
        messages: [],
        pendingMainContext: {
          messages: [
            {
              role: ChatCompletionRequestMessageRoleEnum.User,
              content: 'Need clarification'
            },
            {
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
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
          askToolCallId: 'call_ask'
        },
        userAnswer: ''
      }
    });

    expect(createLLMResponseMock.mock.calls[0][0].body.messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_ask',
      content: 'none'
    });
  });

  it('does not restore active plan state from a compressed context in a new turn', async () => {
    const activePlan = {
      planId: 'plan_restored',
      name: 'Restored plan',
      steps: [
        {
          id: 'step_restored',
          name: 'Resume work',
          status: 'in_progress' as const
        }
      ]
    };
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_update_restored_plan',
        name: 'update_plan',
        args: {
          updates: [
            {
              id: 'step_restored',
              status: 'done',
              note: 'Restored state updated successfully.'
            }
          ]
        }
      }),
      text({
        requestId: 'req_after_restored_plan',
        content: 'restored plan completed'
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime(),
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: `<active_plan>\n${JSON.stringify(activePlan)}\n</active_plan>\n<context_checkpoint>continue the plan</context_checkpoint>`,
            hideInUI: true
          }
        ]
      }
    });

    expect(result.activePlan).toBeUndefined();
    expect(compressRequestMessagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activePlan: undefined
      })
    );
  });

  it('restores active plan state when resuming an interactive turn', async () => {
    const activePlan = {
      planId: 'plan_interactive',
      name: 'Interactive plan',
      steps: [
        {
          id: 'step_interactive',
          name: 'Resume interactive work',
          status: 'in_progress' as const
        }
      ]
    };
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_update_interactive_plan',
        name: 'update_plan',
        args: {
          updates: [
            {
              id: 'step_interactive',
              status: 'done'
            }
          ]
        }
      }),
      text({
        requestId: 'req_after_interactive_plan',
        content: 'interactive plan completed'
      })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime(),
      input: {
        messages: [],
        pendingMainContext: {
          messages: [
            {
              role: ChatCompletionRequestMessageRoleEnum.User,
              content: 'Need clarification'
            },
            {
              role: ChatCompletionRequestMessageRoleEnum.Assistant,
              tool_calls: [
                {
                  id: 'call_ask',
                  type: 'function',
                  function: {
                    name: 'ask_user',
                    arguments: '{}'
                  }
                }
              ]
            }
          ],
          askToolCallId: 'call_ask',
          activePlan
        },
        userAnswer: 'Continue'
      }
    });

    expect(result.activePlan?.steps[0]).toMatchObject({
      id: 'step_interactive',
      status: 'done'
    });
    expect(compressRequestMessagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activePlan: expect.objectContaining({
          planId: 'plan_interactive'
        })
      })
    );
  });
});
