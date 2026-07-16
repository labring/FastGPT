import {
  ChatCompletionRequestMessageRoleEnum,
  ModelTypeEnum
} from '@fastgpt/global/core/ai/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { ChatCompletionTool } from '@fastgpt/global/core/ai/llm/type';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
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
      model: 'gpt-5',
      name: 'GPT-5',
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 60000,
      functionCall: true,
      toolChoice: true,
      reasoning: true,
      reasoningEffort: true
    })
  )
}));

vi.mock('@fastgpt/service/core/ai/llm/compress', async (importOriginal) => {
  const original = await importOriginal<typeof import('@fastgpt/service/core/ai/llm/compress')>();

  return {
    ...original,
    compressRequestMessages: compressRequestMessagesMock,
    compressToolResponse: compressToolResponseMock
  };
});

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

import type { AgentLoopRuntime } from '@fastgpt/service/core/ai/llm/agentLoop/interface';
import { runFastAgentLoop } from '@fastgpt/service/core/ai/llm/agentLoop/provider/fastAgent';

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
  llmParams: {
    model: 'gpt-5',
    stream: true
  },
  toolCatalog: {
    runtimeTools: [tool('search')]
  },
  executeTool: vi.fn(async () => ({
    response: 'runtime tool response',
    assistantMessages: [],
    usages: []
  })),
  ...overrides
});

describe('runFastAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    compressRequestMessagesMock.mockImplementation(async ({ messages }) => ({
      messages
    }));
    compressToolResponseMock.mockImplementation(async ({ response }) => ({
      compressed: response
    }));
  });

  it('injects system tools only when runtime systemTools enable them', async () => {
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({
        requestId: 'req_without_internal_tools',
        content: 'direct answer'
      }),
      text({
        requestId: 'req_with_internal_tools',
        content: 'direct answer'
      })
    ]);

    const result = await runFastAgentLoop({
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'hello'
          }
        ]
      },
      runtime: createRuntime()
    });
    expect(result).toMatchObject({
      usages: [
        expect.objectContaining({
          moduleName: 'account_usage:agent_call'
        })
      ]
    });
    expect(result).not.toHaveProperty('usage');
    expect(
      createLLMResponseMock.mock.calls[0][0].body.tools.map(
        (item: ChatCompletionTool) => item.function.name
      )
    ).toEqual(['search']);

    await runFastAgentLoop({
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'hello'
          }
        ]
      },
      runtime: createRuntime({
        systemTools: {
          plan: { enabled: true },
          ask: { enabled: true },
          sandbox: {
            enabled: true,
            client: {} as any
          }
        }
      })
    });
    const toolNames = createLLMResponseMock.mock.calls[1][0].body.tools.map(
      (item: ChatCompletionTool) => item.function.name
    );
    expect(toolNames).toEqual(
      expect.arrayContaining(['search', 'ask_user', 'set_plan', 'update_plan'])
    );
    expect(toolNames.some((name: string) => name.startsWith('sandbox_'))).toBe(true);
  });

  it('initializes runtime plan from history without changing request messages', async () => {
    const activePlan = {
      planId: 'plan_resume',
      name: 'Resume plan',
      steps: [
        {
          id: 'step_resume',
          name: 'Continue unfinished work',
          status: 'in_progress' as const
        }
      ]
    };
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'call_update_resumed_plan',
        name: 'update_plan',
        args: {
          updates: [{ id: 'step_resume', status: 'done' }]
        }
      }),
      text({
        requestId: 'req_resumed_plan_done',
        content: 'continued'
      })
    ]);

    const result = await runFastAgentLoop({
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'continue'
          }
        ],
        activePlan
      },
      runtime: createRuntime({
        systemTools: {
          plan: { enabled: true }
        }
      })
    });

    expect(result.activePlan?.steps[0]).toMatchObject({
      id: 'step_resume',
      status: 'done'
    });
    expect(compressRequestMessagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        activePlan: expect.objectContaining({
          planId: 'plan_resume'
        })
      })
    );
    const firstRequestMessages = createLLMResponseMock.mock.calls[0][0].body.messages;
    expect(firstRequestMessages).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('<active_plan>')
        })
      ])
    );
    expect(firstRequestMessages).toEqual(
      expect.arrayContaining([expect.objectContaining({ content: 'continue' })])
    );
  });

  it('runs readFile with internal execution while emitting runtime tool card events', async () => {
    const events: any[] = [];
    const usagePush = vi.fn();
    const executeTool = vi.fn();
    const executeReadFile = vi.fn(async () => ({
      response: 'file content',
      usages: [
        {
          moduleName: 'File read',
          totalPoints: 2,
          inputTokens: 10,
          outputTokens: 3
        }
      ],
      metadata: {
        id: 'read_file_call',
        nodeId: 'read_file_call',
        moduleType: FlowNodeTypeEnum.tool,
        moduleName: 'Read file',
        toolRes: 'file content'
      }
    }));

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'read_file_call',
        name: 'read_files',
        args: {
          ids: ['file_1']
        }
      }),
      text({
        requestId: 'req_final',
        content: 'done'
      })
    ]);

    await runFastAgentLoop({
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'read file'
          }
        ]
      },
      runtime: createRuntime({
        systemTools: {
          readFile: {
            enabled: true,
            execute: executeReadFile
          }
        },
        executeTool,
        usagePush,
        emitEvent: (event) => events.push(event)
      })
    });

    expect(executeReadFile).toHaveBeenCalledTimes(1);
    expect(executeTool).not.toHaveBeenCalled();
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['tool_call', 'tool_run_end'])
    );
    expect(events.map((event) => event.type)).not.toContain('file_read_start');
    expect(events.map((event) => event.type)).not.toContain('file_read_end');
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_run_end',
          call: expect.objectContaining({
            id: 'read_file_call'
          }),
          metadata: expect.objectContaining({
            moduleName: 'Read file'
          })
        })
      ])
    );
    expect(usagePush).toHaveBeenCalledWith([
      expect.objectContaining({
        moduleName: 'File read',
        totalPoints: 2
      })
    ]);
  });

  it('does not intercept read_files runtime tools when the system tool is disabled', async () => {
    const events: any[] = [];
    const executeTool = vi.fn(async () => ({
      response: 'runtime read file response',
      assistantMessages: [],
      usages: [
        {
          moduleName: 'Runtime tool',
          totalPoints: 1
        }
      ]
    }));

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'runtime_read_file_call',
        name: 'read_files',
        args: {
          ids: ['file_1']
        }
      }),
      text({
        requestId: 'req_final',
        content: 'done'
      })
    ]);

    await runFastAgentLoop({
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'read file with runtime tool'
          }
        ]
      },
      runtime: createRuntime({
        toolCatalog: {
          runtimeTools: [tool('read_files')]
        },
        executeTool,
        emitEvent: (event) => events.push(event)
      })
    });

    expect(executeTool).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['tool_call', 'tool_run_start', 'tool_run_end'])
    );
    expect(events.map((event) => event.type)).not.toContain('file_read_start');
    expect(events.map((event) => event.type)).not.toContain('file_read_end');
  });

  it('runs dataset_search with generic query params and current files', async () => {
    const events: any[] = [];
    const usagePush = vi.fn();
    const executeTool = vi.fn();
    const executeDatasetSearch = vi.fn(async () => ({
      response: 'dataset content',
      usages: [
        {
          moduleName: 'Dataset search',
          totalPoints: 2,
          inputTokens: 20,
          outputTokens: 0
        }
      ],
      metadata: {
        id: 'dataset_search_call',
        nodeId: 'dataset_search_call',
        moduleType: FlowNodeTypeEnum.datasetSearchNode,
        moduleName: 'Dataset search',
        toolRes: 'dataset content'
      }
    }));

    mockCreateLLMResponseQueue(createLLMResponseMock, [
      toolCall({
        id: 'dataset_search_call',
        name: 'dataset_search',
        args: {
          query: ['FastGPT']
        }
      }),
      text({
        requestId: 'req_final',
        content: 'done'
      })
    ]);

    await runFastAgentLoop({
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.User,
            content: 'search dataset'
          }
        ]
      },
      runtime: createRuntime({
        systemTools: {
          datasetSearch: {
            enabled: true,
            currentInputFiles: ['https://files.example.com/image.png'],
            execute: executeDatasetSearch
          }
        },
        executeTool,
        usagePush,
        emitEvent: (event) => events.push(event)
      })
    });

    expect(executeDatasetSearch).toHaveBeenCalledTimes(1);
    expect(executeTool).not.toHaveBeenCalled();
    const patchedArgs = JSON.parse(executeDatasetSearch.mock.calls[0][0].call.function.arguments);
    expect(patchedArgs).toEqual({
      query: ['FastGPT', 'https://files.example.com/image.png']
    });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['tool_call', 'tool_run_start', 'tool_run_end'])
    );
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'tool_run_end',
          call: expect.objectContaining({
            id: 'dataset_search_call'
          }),
          metadata: expect.objectContaining({
            moduleName: 'Dataset search'
          })
        })
      ])
    );
    expect(usagePush).toHaveBeenCalledWith([
      expect.objectContaining({
        moduleName: 'Dataset search',
        totalPoints: 2
      })
    ]);
  });

  it('pushes usages produced by interactive tool resume', async () => {
    const usagePush = vi.fn();
    const emitEvent = vi.fn();
    const interactiveUsage = {
      moduleName: 'Interactive tool',
      totalPoints: 3
    };
    const executeInteractiveTool = vi.fn(async () => ({
      response: 'interactive response',
      assistantMessages: [],
      usages: [interactiveUsage],
      stop: true
    }));

    await runFastAgentLoop({
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            content: null,
            tool_calls: [
              {
                id: 'call_interactive',
                type: 'function',
                function: {
                  name: 'select_project',
                  arguments: '{"scope":"active"}'
                }
              }
            ]
          }
        ],
        childrenInteractiveParams: {
          childrenResponse: {
            type: 'userSelect'
          },
          toolParams: {
            toolCallId: 'call_interactive',
            memoryRequestMessages: [
              {
                role: ChatCompletionRequestMessageRoleEnum.Tool,
                tool_call_id: 'call_interactive',
                content: 'pending'
              }
            ]
          }
        }
      },
      runtime: createRuntime({
        executeInteractiveTool,
        usagePush,
        emitEvent
      })
    });

    expect(executeInteractiveTool).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          id: 'call_interactive',
          function: expect.objectContaining({
            name: 'select_project',
            arguments: '{"scope":"active"}'
          })
        }),
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: ChatCompletionRequestMessageRoleEnum.Assistant
          })
        ])
      })
    );
    expect(usagePush).toHaveBeenCalledWith([interactiveUsage]);
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_run_end',
        call: expect.objectContaining({ id: 'call_interactive' }),
        response: 'interactive response',
        usages: [interactiveUsage]
      })
    );
  });

  it('turns an interactive tool resume exception into a tool response and continues', async () => {
    const emitEvent = vi.fn();
    mockCreateLLMResponseQueue(createLLMResponseMock, [
      text({ requestId: 'req_after_resume_error', content: 'recovered answer' })
    ]);

    const result = await runFastAgentLoop({
      input: {
        messages: [
          {
            role: ChatCompletionRequestMessageRoleEnum.Assistant,
            content: null,
            tool_calls: [
              {
                id: 'call_interactive_error',
                type: 'function',
                function: {
                  name: 'select_project',
                  arguments: '{}'
                }
              }
            ]
          },
          {
            role: ChatCompletionRequestMessageRoleEnum.Tool,
            tool_call_id: 'call_interactive_error',
            content: 'waiting for selection'
          }
        ],
        childrenInteractiveParams: {
          childrenResponse: { type: 'userSelect' },
          toolParams: { toolCallId: 'call_interactive_error' }
        }
      },
      runtime: createRuntime({
        executeInteractiveTool: vi.fn().mockRejectedValue(new Error('resume failed')),
        emitEvent
      })
    });

    expect(result.status).toBe('done');
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'tool_run_end',
        call: expect.objectContaining({ id: 'call_interactive_error' }),
        response: 'Tool error: resume failed',
        errorMessage: 'Tool error: resume failed'
      })
    );
    expect(createLLMResponseMock.mock.calls[0][0].body.messages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_interactive_error',
      content: 'Tool error: resume failed'
    });
  });
});
