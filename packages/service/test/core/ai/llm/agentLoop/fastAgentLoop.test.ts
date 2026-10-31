import { AgentAskInteractiveSchema } from '@fastgpt/global/core/ai/agent/type';
import {
  ChatCompletionRequestMessageRoleEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import type {
  ChatCompletionTool,
  ChatCompletionToolMessageContentPart
} from '@fastgpt/global/core/ai/llm/type';
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

vi.mock('@fastgpt/service/core/ai/sandbox/application/toolCall', () => ({
  runSandboxTools: runSandboxToolsMock,
  getSandboxToolInfo: vi.fn(() => ({
    name: 'Sandbox',
    avatar: 'sandbox-avatar'
  }))
}));

import {
  buildDefaultAgentSystemPrompt,
  createAskUserAgentTool,
  createSetPlanAgentTool,
  createUpdatePlanAgentTool
} from '@fastgpt/service/core/ai/llm/agentLoop/interface';
import { createAgentLoopSandboxTools } from '@fastgpt/service/core/ai/llm/agentLoop/domain/systemTool/sandbox';
import {
  runFastAgentMainLoop,
  type AgentLoopRuntime
} from '@fastgpt/service/core/ai/llm/agentLoop/provider/fastAgent/loop';
import { buildToolMessageContent } from '@fastgpt/service/core/ai/llm/agentLoop/domain/tool';

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

const modelData = {
  modelId: '68ad85a7463006c963799a61',
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'gpt-4',
  name: 'GPT-4',
  config: {
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 60000,
    functionCall: true,
    toolChoice: true,
    reasoning: false
  }
} as any;

const createRuntime = (overrides?: Partial<AgentLoopRuntime>): AgentLoopRuntime => ({
  model: modelData,
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
        systemPrompt: buildDefaultAgentSystemPrompt(),
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
    expect(mainAgentPrompt).toContain('你是一个 Work Agent');
  });

  it('continues the same loop when completion policy rejects a natural completion', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({ requestId: 'req_early', content: 'phase summary' }),
      text({ requestId: 'req_terminal', content: 'terminal answer' })
    ]);
    const completionPolicy = vi
      .fn()
      .mockResolvedValueOnce({
        action: 'continue',
        message: 'Continue until terminal facts exist.'
      })
      .mockResolvedValueOnce({ action: 'complete' });

    const result = await runFastAgentMainLoop({
      runtime: createRuntime({ completionPolicy }),
      input: {
        messages: [{ role: ChatCompletionRequestMessageRoleEnum.User, content: 'build it' }]
      }
    });

    expect(result.status).toBe('done');
    expect(createLLMResponseMock).toHaveBeenCalledTimes(2);
    expect(completionPolicy).toHaveBeenNthCalledWith(1, { requestIndex: 1 });
    expect(completionPolicy).toHaveBeenNthCalledWith(2, { requestIndex: 2 });
    expect(createLLMResponseMock.mock.calls[1][0].body.messages).toContainEqual({
      role: ChatCompletionRequestMessageRoleEnum.User,
      hideInUI: true,
      content: 'Continue until terminal facts exist.'
    });
  });

  it('does not continue when cancelled while completion policy is pending', async () => {
    let isStopping = false;
    const continuationMessage = 'Continue until terminal facts exist.';
    const completionPolicy = vi.fn(async () => {
      await Promise.resolve();
      isStopping = true;
      return { action: 'continue' as const, message: continuationMessage };
    });
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({ requestId: 'req_cancelled', content: 'phase summary' })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime({
        completionPolicy,
        checkIsStopping: () => isStopping
      }),
      input: {
        messages: [{ role: ChatCompletionRequestMessageRoleEnum.User, content: 'build it' }]
      }
    });

    expect(result.status).toBe('aborted');
    expect(completionPolicy).toHaveBeenCalledTimes(1);
    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
    expect(result.completeMessages.some((message) => message.content === continuationMessage)).toBe(
      false
    );
  });

  it('returns an error when completion policy cannot reach terminal facts within the run budget', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({ requestId: 'req_budget', content: 'still incomplete' })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime({
        maxRunAgentTimes: 1,
        completionPolicy: () => ({ action: 'continue', message: 'Continue.' })
      }),
      input: {
        messages: [{ role: ChatCompletionRequestMessageRoleEnum.User, content: 'build it' }]
      }
    });

    expect(result.status).toBe('error');
    expect(String(result.error)).toContain('Agent loop reached max run times: 1');
    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
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
        modelId: '507f1f77bcf86cd799439011',
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

  it('pauses for an opaque runtime interactive without classifying or wrapping it', async () => {
    const interactive = { type: 'future-interaction', params: { display: 'Choose' } };
    const emitEvent = vi.fn();
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({ id: 'runtime-call', name: 'search', args: {} })
    ]);
    const result = await runFastAgentMainLoop({
      runtime: createRuntime({
        emitEvent,
        executeTool: vi.fn(async () => ({
          response: 'Waiting',
          interactive,
          assistantMessages: [],
          usages: []
        }))
      }),
      input: { messages: [{ role: 'user', content: 'Start' }] }
    });
    expect(result.status).toBe('paused');
    expect(result.pause).toEqual({ toolCallId: 'runtime-call', interactive });
    expect(emitEvent).toHaveBeenCalledWith({
      type: 'tool_interactive',
      call: expect.objectContaining({ id: 'runtime-call' }),
      interactive
    });
    expect(createLLMResponseMock).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])('passes child responses through tool end (resume: %s)', async (resume) => {
    const emitEvent = vi.fn();
    const childResponses = [{ text: { content: 'child output' }, hideReason: true }];
    const executeTool = vi.fn(async () => ({
      response: 'tool result',
      assistantMessages: [],
      assistantResponses: childResponses,
      usages: []
    }));
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      ...(!resume ? [toolCall({ id: 'call_child', name: 'search', args: {} })] : []),
      text({ requestId: 'req_after_child', content: 'parent answer' })
    ]);

    const result = await runFastAgentMainLoop({
      runtime: createRuntime({ executeTool, executeInteractiveTool: executeTool, emitEvent }),
      input: {
        messages: [{ role: 'user', content: 'continue' }],
        ...(resume
          ? {
              childrenInteractiveParams: {
                childrenResponse: { type: 'userSelect' },
                toolCallId: 'call_child'
              }
            }
          : {})
      }
    });

    expect(result.status).toBe('done');
    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_run_end',
        call: expect.objectContaining({ id: 'call_child' }),
        assistantResponses: childResponses
      })
    );
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

  it('returns Ask without saving a message snapshot', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_ask',
        name: 'ask_user',
        reasoning: 'Need to ask before planning can continue.',
        args: {
          reason: 'Need private repository path',
          blockerType: 'missing_required_input',
          questions: [
            {
              question: 'Which repository should I inspect?',
              options: [
                { summary: 'Current workspace', value: 'Use the current workspace' },
                { summary: 'Repository path', value: 'I will provide a repository path' },
                { summary: 'Skip inspection', value: 'Skip repository inspection' }
              ]
            }
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
    const parsed = AgentAskInteractiveSchema.safeParse(result.pause?.interactive);
    expect(parsed.success).toBe(true);
    expect(parsed.success ? JSON.parse(parsed.data.params.arguments).questions : undefined).toEqual(
      [
        {
          question: 'Which repository should I inspect?',
          options: [
            { summary: 'Current workspace', value: 'Use the current workspace' },
            { summary: 'Repository path', value: 'I will provide a repository path' },
            { summary: 'Skip inspection', value: 'Skip repository inspection' }
          ]
        }
      ]
    );
    expect(result).not.toHaveProperty('pendingMainContext');
    expect(result.pause).toMatchObject({ toolCallId: 'call_ask' });
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
                questions: [
                  {
                    question: 'Should I continue with the data change?',
                    options: [
                      { summary: 'Continue', value: 'Continue' },
                      { summary: 'Cancel', value: 'Cancel' },
                      {
                        summary: 'Review proposal',
                        value: 'Review the proposed change first'
                      }
                    ]
                  }
                ]
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
        toolCallId: 'call_ask_first',
        interactive: {
          type: 'agentAsk',
          params: { toolCallId: 'call_ask_first', arguments: expect.any(String) }
        }
      })
    );
    expect(executeTool).not.toHaveBeenCalled();
    expect(result.assistantMessages).toContainEqual(
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

  it('writes the tool response parts into the next round tool message', async () => {
    const imagePart = {
      type: 'image_url' as const,
      image_url: { url: 'data:image/png;base64,AAAA' }
    };
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({ id: 'call_image', name: 'search', args: { query: 'chart' } }),
      text({ requestId: 'req_after_image', content: 'done' })
    ]);

    const executeTool = vi.fn(async () => ({
      response: '{"jobId":"task-123"}',
      content: [imagePart],
      assistantMessages: [],
      usages: [],
      stop: false
    }));

    const result = await runFastAgentMainLoop({
      runtime: createRuntime({ executeTool }),
      input: { messages: [{ role: ChatCompletionRequestMessageRoleEnum.User, content: 'draw it' }] }
    });

    expect(result.status).toBe('done');
    // 关键接缝：结构化的 content 必须真的写进下一轮请求的 tool 消息，否则等于没实现。
    const secondRequest = createLLMResponseMock.mock.calls[1][0];
    const toolMessage = (secondRequest.body.messages as ChatCompletionMessageParam[]).find(
      (message) => message.role === ChatCompletionRequestMessageRoleEnum.Tool
    );
    expect(toolMessage?.content).toEqual([
      { type: 'text', text: '{"jobId":"task-123"}' },
      imagePart
    ]);
  });

  it('uses reconstructed messages without an Ask-specific snapshot', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [text({ content: 'continued' })]);
    const messages = [{ role: 'user' as const, content: 'Continue normally' }];
    await runFastAgentMainLoop({ runtime: createRuntime(), input: { messages } });
    expect(createLLMResponseMock.mock.calls[0][0].body.messages[0]).toEqual(messages[0]);
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
        activePlan
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

describe('buildToolMessageContent', () => {
  it('returns the final text when no content parts are provided', () => {
    expect(buildToolMessageContent({ text: 'summary' })).toBe('summary');
    expect(buildToolMessageContent({ content: [], text: 'summary' })).toBe('summary');
  });

  it('prepends the final text and keeps image parts', () => {
    const content: ChatCompletionToolMessageContentPart[] = [
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }
    ];

    expect(buildToolMessageContent({ content, text: 'summary' })).toEqual([
      { type: 'text', text: 'summary' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }
    ]);
  });

  it('caps the image parts so one tool result cannot flood the request', () => {
    const content: ChatCompletionToolMessageContentPart[] = Array.from(
      { length: 6 },
      (_, index) => ({
        type: 'image_url' as const,
        image_url: { url: `data:image/png;base64,IMG${index}` }
      })
    );

    const result = buildToolMessageContent({ content, text: 'summary' });

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1 + 4);
  });

  it('replaces raw text parts with the final text', () => {
    const content: ChatCompletionToolMessageContentPart[] = [
      { type: 'text', text: 'raw uncompressed output' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }
    ];

    expect(buildToolMessageContent({ content, text: 'summary' })).toEqual([
      { type: 'text', text: 'summary' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,aW1hZ2U=' } }
    ]);
  });
});
