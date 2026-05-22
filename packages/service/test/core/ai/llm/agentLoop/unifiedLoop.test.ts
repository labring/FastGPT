import {
  ChatCompletionRequestMessageRoleEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockCreateLLMResponseQueue, text, toolCall } from './_mocks/llmQueue';

const { createLLMResponseMock, compressRequestMessagesMock, compressToolResponseMock } = vi.hoisted(
  () => ({
    createLLMResponseMock: vi.fn(),
    compressRequestMessagesMock: vi.fn(),
    compressToolResponseMock: vi.fn()
  })
);

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

import {
  createAskAgentTool,
  createUpdatePlanTool,
  runUnifiedAgentLoop,
  type AgentLoopRuntime
} from '@fastgpt/service/core/ai/llm/agentLoop';

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
    askTool: createAskAgentTool(),
    updatePlanTool: createUpdatePlanTool()
  },
  executeTool: vi.fn(async () => ({
    response: 'runtime tool response',
    assistantMessages: [],
    usages: []
  })),
  ...overrides
});

describe('runUnifiedAgentLoop', () => {
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

    const result = await runUnifiedAgentLoop({
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

  it('passes context checkpoint from base loop to unified result', async () => {
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

    const result = await runUnifiedAgentLoop({
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

    await runUnifiedAgentLoop({
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

    const result = await runUnifiedAgentLoop({
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
            updates: [
              {
                action: 'set_plan',
                plan: {
                  planId: 'plan_1',
                  task: 'Compare products',
                  description: 'Compare FastGPT and Dify',
                  steps: [
                    {
                      id: 's1',
                      title: 'Compare positioning',
                      description: 'Compare product positioning',
                      acceptanceCriteria: ['Positioning is clear'],
                      status: 'pending',
                      evidence: []
                    },
                    {
                      id: 's2',
                      title: 'Compare workflow',
                      description: 'Compare workflow and agent capabilities',
                      acceptanceCriteria: ['Workflow differences are clear'],
                      status: 'pending',
                      evidence: []
                    }
                  ]
                }
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
      toolCall({
        id: 'call_done_s1',
        name: 'update_plan',
        args: {
          updates: [
            {
              action: 'update_step',
              stepId: 's1',
              status: 'done',
              outputSummary: 'FastGPT is RAG-focused; Dify is broader.'
            },
            {
              action: 'update_step',
              stepId: 's2',
              status: 'done',
              outputSummary: 'Dify has broader workflow and agent orchestration.'
            }
          ]
        }
      }),
      text({
        requestId: 'req_final',
        content: 'final comparison'
      })
    ]);

    const result = await runUnifiedAgentLoop({
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
      id: 's1',
      status: 'done',
      outputSummary: 'FastGPT is RAG-focused; Dify is broader.'
    });
    expect(result.activePlan?.steps[1]).toMatchObject({
      id: 's2',
      status: 'done',
      outputSummary: 'Dify has broader workflow and agent orchestration.'
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
            planId: 'plan_1'
          })
        }),
        expect.objectContaining({
          type: 'plan_update',
          plan: expect.objectContaining({
            planId: 'plan_1',
            steps: expect.arrayContaining([
              expect.objectContaining({
                id: 's1',
                status: 'done'
              }),
              expect.objectContaining({
                id: 's2',
                status: 'done'
              })
            ])
          })
        }),
        expect.objectContaining({
          type: 'stop_gate_feedback',
          id: 'stop_gate_2_req_too_early'
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
          updates: [
            {
              action: 'set_plan',
              plan: {
                planId: 'plan_stream',
                task: '流式输出测试',
                description: '创建两步计划并逐步完成。',
                steps: [
                  {
                    id: 's1',
                    title: '准备测试',
                    description: '把准备测试标记为执行中并完成。',
                    acceptanceCriteria: ['准备测试完成'],
                    status: 'pending',
                    evidence: []
                  },
                  {
                    id: 's2',
                    title: '完成测试',
                    description: '把完成测试标记为执行中并完成。',
                    acceptanceCriteria: ['完成测试完成'],
                    status: 'pending',
                    evidence: []
                  }
                ]
              }
            }
          ]
        }
      }),
      toolCall({
        id: 'call_finish_plan',
        name: 'update_plan',
        args: {
          updates: [
            {
              action: 'update_step',
              stepId: 's1',
              status: 'done',
              outputSummary: '准备测试已完成。'
            },
            {
              action: 'update_step',
              stepId: 's2',
              status: 'done',
              outputSummary: '完成测试已完成。'
            }
          ]
        }
      }),
      text({
        requestId: 'req_final',
        content: '流式计划测试完成。'
      })
    ]);

    const result = await runUnifiedAgentLoop({
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
            planId: 'plan_stream'
          })
        }),
        expect.objectContaining({
          type: 'plan_update',
          plan: expect.objectContaining({
            planId: 'plan_stream',
            steps: expect.arrayContaining([
              expect.objectContaining({
                id: 's1',
                status: 'done'
              }),
              expect.objectContaining({
                id: 's2',
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
      task: '完成计划后回答',
      description: '计划已经完成，下一轮只能最终回答。',
      steps: [
        {
          id: 's1',
          title: '完成准备',
          description: '准备工作已完成。',
          acceptanceCriteria: ['准备完成'],
          status: 'done' as const,
          evidence: [],
          outputSummary: '准备完成。'
        }
      ]
    };

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({
        requestId: 'req_final',
        content: '最终流式回答'
      })
    ]);

    const result = await runUnifiedAgentLoop({
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
          updates: [
            {
              action: 'set_plan',
              plan: {
                planId: 'plan_1',
                task: 'Research docs',
                description: 'Research docs',
                steps: [
                  {
                    id: 's1',
                    title: 'Collect evidence',
                    description: 'Collect evidence',
                    acceptanceCriteria: ['Evidence collected'],
                    status: 'pending',
                    evidence: []
                  }
                ]
              }
            }
          ]
        }
      }),
      toolCall({
        id: 'call_done',
        name: 'update_plan',
        args: {
          updates: [
            {
              action: 'update_step',
              stepId: 's1',
              status: 'done',
              outputSummary: 'Initial evidence collected.'
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
      toolCall({
        id: 'call_record_tool',
        name: 'update_plan',
        args: {
          updates: [
            {
              action: 'update_step',
              stepId: 's1',
              status: 'done',
              evidence: [
                {
                  kind: 'tool_result',
                  ref: 'call_search',
                  summary: 'Recorded runtime tool result.'
                }
              ],
              outputSummary: 'Initial evidence and latest evidence collected.'
            }
          ]
        }
      }),
      text({
        requestId: 'req_final',
        content: 'final with recorded tool result'
      })
    ]);

    const result = await runUnifiedAgentLoop({
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
    expect(result.activePlan?.steps[0].evidence).toContainEqual({
      kind: 'tool_result',
      ref: 'call_search',
      summary: 'Recorded runtime tool result.'
    });
  });

  it('returns ask with pending main context when ask_agent is called', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_ask',
        name: 'ask_agent',
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

    const result = await runUnifiedAgentLoop({
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
            name: 'ask_agent',
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
        name: 'ask_agent',
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

    const result = await runUnifiedAgentLoop({
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
          updates: [
            {
              action: 'set_plan',
              plan: {
                planId: 'plan_ask_resume',
                task: 'Research before asking',
                description: 'Research then ask the user',
                steps: [
                  {
                    id: 's1',
                    title: 'Collect evidence',
                    description: 'Collect evidence before asking',
                    acceptanceCriteria: ['Evidence collected'],
                    status: 'pending',
                    evidence: []
                  }
                ]
              }
            }
          ]
        }
      }),
      toolCall({
        id: 'call_done',
        name: 'update_plan',
        args: {
          updates: [
            {
              action: 'update_step',
              stepId: 's1',
              status: 'done',
              outputSummary: 'Initial evidence collected.'
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
        name: 'ask_agent',
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
      toolCall({
        id: 'call_record_tool',
        name: 'update_plan',
        args: {
          updates: [
            {
              action: 'update_step',
              stepId: 's1',
              status: 'done',
              evidence: [
                {
                  kind: 'tool_result',
                  ref: 'call_search',
                  summary: 'Recorded latest evidence after user confirmation.'
                }
              ],
              outputSummary: 'Initial and latest evidence collected.'
            }
          ]
        }
      }),
      text({
        requestId: 'req_final_after_resume',
        content: 'final after resume'
      })
    ]);

    const firstResult = await runUnifiedAgentLoop({
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

    const resumedResult = await runUnifiedAgentLoop({
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
