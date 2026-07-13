import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const {
  agentPromptMock,
  agentContinueMock,
  agentSubscribeMock,
  agentAbortMock,
  agentConstructorArgs,
  agentPayloadResults,
  agentResponseText,
  agentToolToExecute,
  runSandboxToolsMock
} = vi.hoisted(() => ({
  agentPromptMock: vi.fn(),
  agentContinueMock: vi.fn(),
  agentSubscribeMock: vi.fn(),
  agentAbortMock: vi.fn(),
  agentConstructorArgs: [] as any[],
  agentPayloadResults: [] as any[],
  agentResponseText: {
    value: 'pi answer'
  },
  agentToolToExecute: {
    value: undefined as
      | {
          name: string;
          callId: string;
          args: Record<string, unknown>;
        }
      | undefined
  },
  runSandboxToolsMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/interface/toolCall', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@fastgpt/service/core/ai/sandbox/interface/toolCall')>();
  return {
    ...original,
    runSandboxTools: runSandboxToolsMock,
    getSandboxToolInfo: vi.fn(() => ({
      name: 'Sandbox',
      avatar: 'sandbox-avatar'
    }))
  };
});

vi.mock('@mariozechner/pi-agent-core', () => ({
  Agent: vi.fn().mockImplementation(function (args) {
    agentConstructorArgs.push(args);
    const subscribers: Array<(event: any) => void> = [];

    return {
      state: {
        messages: [
          {
            role: 'assistant',
            content: 'saved pi message'
          }
        ],
        errorMessage: ''
      },
      prompt: async (prompt: string) => {
        await agentPromptMock(prompt);
        agentPayloadResults.push(
          args.onPayload?.(
            {
              messages: [],
              model: 'gpt-5',
              stream: true
            },
            { name: 'GPT-5' }
          )
        );
        if (agentToolToExecute.value) {
          const pendingTool = agentToolToExecute.value;
          subscribers.forEach((subscriber) => {
            subscriber({
              type: 'message_end',
              message: {
                role: 'assistant',
                content: [
                  {
                    type: 'toolCall',
                    id: pendingTool.callId,
                    name: pendingTool.name,
                    arguments: pendingTool.args
                  }
                ],
                usage: {
                  input: 3,
                  output: 2
                },
                stopReason: 'toolUse'
              }
            });
          });
          const tool = args.initialState.tools.find((item: any) => item.name === pendingTool.name);
          await tool.execute(pendingTool.callId, pendingTool.args);
          return;
        }
        subscribers.forEach((subscriber) => {
          subscriber({
            type: 'message_update',
            assistantMessageEvent: {
              type: 'text_delta',
              delta: agentResponseText.value
            }
          });
        });
        subscribers.forEach((subscriber) => {
          subscriber({
            type: 'message_end',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: agentResponseText.value }],
              usage: {
                input: 3,
                output: 2
              },
              stopReason: 'stop'
            }
          });
        });
      },
      continue: agentContinueMock,
      subscribe: (handler: (event: any) => void) => {
        agentSubscribeMock(handler);
        subscribers.push(handler);
      },
      abort: agentAbortMock
    };
  })
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
      maxTemperature: 2,
      showTopP: true,
      showStopSign: true,
      responseFormatList: ['json_object', 'json_schema'],
      functionCall: true,
      toolChoice: true,
      reasoning: true,
      reasoningEffort: true
    })
  )
}));

vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: vi.fn(() => ({
    totalPoints: 1
  }))
}));

import { runPiAgentLoop } from '@fastgpt/service/core/ai/llm/agentLoop/provider/piAgent/run';

describe('runPiAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentConstructorArgs.length = 0;
    agentPayloadResults.length = 0;
    agentResponseText.value = 'pi answer';
    agentToolToExecute.value = undefined;
  });

  it('runs pi-agent-core through the provider contract and returns provider state', async () => {
    const events: any[] = [];
    const usagePush = vi.fn();
    const result = await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }],
        systemPrompt: 'system prompt',
        providerState: {
          piMessages: [
            {
              role: 'assistant',
              content: 'previous pi message'
            }
          ]
        }
      },
      runtime: {
        llmParams: {
          model: 'gpt-5',
          reasoningEffort: 'high',
          stream: true
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false),
        usagePush,
        emitEvent: (event) => events.push(event)
      }
    });

    expect(agentPromptMock).toHaveBeenCalledWith('hello');
    expect(agentConstructorArgs[0].initialState.systemPrompt).toBe('system prompt');
    expect(agentConstructorArgs[0].initialState.messages).toEqual([
      {
        role: 'assistant',
        content: 'previous pi message'
      }
    ]);
    expect(result).toMatchObject({
      status: 'done',
      completeMessages: [
        { role: 'user', content: 'hello' },
        expect.objectContaining({ role: 'assistant', content: 'pi answer' })
      ],
      assistantMessages: [
        expect.objectContaining({
          role: 'assistant',
          content: 'pi answer'
        })
      ],
      usages: [
        expect.objectContaining({
          inputTokens: 3,
          outputTokens: 2,
          totalPoints: 1
        })
      ],
      providerState: {
        piMessages: [
          {
            role: 'assistant',
            content: 'saved pi message'
          }
        ]
      }
    });
    expect(events.map((event) => event.type)).toEqual([
      'llm_request_start',
      'answer_delta',
      'llm_request_end'
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'llm_request_end',
      modelName: 'GPT-5',
      usages: [
        expect.objectContaining({
          inputTokens: 3,
          outputTokens: 2,
          totalPoints: 1
        })
      ]
    });
    expect(usagePush).toHaveBeenCalledWith([
      expect.objectContaining({
        inputTokens: 3,
        outputTokens: 2,
        totalPoints: 1
      })
    ]);
  });

  it('only injects system tools when runtime systemTools enable them', async () => {
    await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        llmParams: {
          model: 'gpt-5'
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false)
      }
    });
    expect(agentConstructorArgs.at(-1).initialState.tools.map((tool: any) => tool.name)).toEqual(
      []
    );

    await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        llmParams: {
          model: 'gpt-5'
        },
        systemTools: {
          plan: { enabled: true },
          ask: { enabled: true },
          datasetSearch: {
            enabled: true,
            execute: vi.fn()
          }
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false)
      }
    });

    expect(agentConstructorArgs.at(-1).initialState.tools.map((tool: any) => tool.name)).toEqual([
      'update_plan',
      'ask_user',
      'dataset_search'
    ]);
  });

  it('emits one successful plan operation with the complete plan', async () => {
    const events: any[] = [];
    agentToolToExecute.value = {
      name: 'update_plan',
      callId: 'call_plan',
      args: {
        action: 'set_plan',
        name: 'Implementation plan',
        description: null,
        steps: [{ name: 'Merge plan events', description: null }]
      }
    };

    await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'Create a plan' }]
      },
      runtime: {
        llmParams: {
          model: 'gpt-5'
        },
        systemTools: {
          plan: { enabled: true }
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false),
        emitEvent: (event) => events.push(event)
      }
    });

    expect(events.filter((event) => event.type === 'plan_operation')).toEqual([
      expect.objectContaining({
        type: 'plan_operation',
        operation: 'set_plan',
        success: true,
        id: 'call_plan',
        plan: expect.objectContaining({
          name: 'Implementation plan',
          steps: [expect.objectContaining({ name: 'Merge plan events' })]
        })
      })
    ]);
  });

  it('filters runtime tools that conflict with enabled system tool names', async () => {
    await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        llmParams: {
          model: 'gpt-5'
        },
        systemTools: {
          plan: { enabled: true },
          ask: { enabled: true },
          readFile: {
            enabled: true,
            execute: vi.fn()
          },
          datasetSearch: {
            enabled: true,
            execute: vi.fn()
          }
        },
        toolCatalog: {
          runtimeTools: [
            {
              type: 'function',
              function: {
                name: 'update_plan',
                description: 'conflicting plan tool',
                parameters: {}
              }
            },
            {
              type: 'function',
              function: {
                name: 'ask_user',
                description: 'conflicting ask tool',
                parameters: {}
              }
            },
            {
              type: 'function',
              function: {
                name: 'read_files',
                description: 'conflicting read file tool',
                parameters: {}
              }
            },
            {
              type: 'function',
              function: {
                name: 'dataset_search',
                description: 'conflicting dataset search tool',
                parameters: {}
              }
            },
            {
              type: 'function',
              function: {
                name: 'search',
                description: 'runtime search',
                parameters: {}
              }
            }
          ]
        },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false)
      }
    });

    const toolNames = agentConstructorArgs.at(-1).initialState.tools.map((tool: any) => tool.name);
    expect(toolNames.filter((name: string) => name === 'update_plan')).toHaveLength(1);
    expect(toolNames.filter((name: string) => name === 'ask_user')).toHaveLength(1);
    expect(toolNames.filter((name: string) => name === 'read_files')).toHaveLength(1);
    expect(toolNames.filter((name: string) => name === 'dataset_search')).toHaveLength(1);
    expect(toolNames).toContain('search');
  });

  it('pauses when a runtime tool returns child interactive', async () => {
    const executeTool = vi.fn().mockResolvedValue({
      response: 'waiting for selection',
      assistantMessages: [],
      usages: [],
      interactive: {
        type: 'userSelect',
        entryNodeIds: ['select_1']
      }
    });
    agentToolToExecute.value = {
      name: 'search',
      callId: 'call_search',
      args: { q: 'FastGPT' }
    };

    const result = await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        llmParams: { model: 'gpt-5' },
        toolCatalog: {
          runtimeTools: [
            {
              type: 'function',
              function: {
                name: 'search',
                description: 'Search',
                parameters: { type: 'object', properties: {} }
              }
            }
          ]
        },
        executeTool,
        executeInteractiveTool: vi.fn(),
        checkIsStopping: vi.fn(() => false)
      }
    });

    expect(result).toMatchObject({
      status: 'paused',
      pause: {
        type: 'tool_child',
        toolCallId: 'call_search',
        childrenResponse: {
          type: 'userSelect'
        }
      }
    });
    expect(agentAbortMock).toHaveBeenCalled();
  });

  it('forwards runtime tool metadata, assistant messages and usage through tool_run_end', async () => {
    const events: any[] = [];
    const usagePush = vi.fn();
    const toolUsage = {
      moduleName: 'tool',
      inputTokens: 2,
      outputTokens: 1,
      totalPoints: 3
    };
    const metadata = {
      nodeResponse: {
        moduleName: 'Tool'
      }
    };
    agentToolToExecute.value = {
      name: 'search',
      callId: 'call_search',
      args: { q: 'FastGPT' }
    };

    const executeTool = vi.fn().mockResolvedValue({
      response: 'search result',
      assistantMessages: [{ role: 'assistant', content: 'child answer' }],
      usages: [toolUsage],
      errorMessage: 'partial tool error',
      metadata
    });
    const result = await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        llmParams: { model: 'gpt-5' },
        toolCatalog: {
          runtimeTools: [
            {
              type: 'function',
              function: {
                name: 'search',
                description: 'Search',
                parameters: { type: 'object', properties: {} }
              }
            }
          ]
        },
        executeTool,
        checkIsStopping: vi.fn(() => false),
        usagePush,
        emitEvent: (event) => events.push(event)
      }
    });

    expect(events.find((event) => event.type === 'tool_run_end')).toMatchObject({
      call: { id: 'call_search' },
      response: 'search result',
      assistantMessages: [{ role: 'assistant', content: 'child answer' }],
      usages: [toolUsage],
      errorMessage: 'partial tool error',
      metadata
    });
    expect(executeTool).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: 'user', content: 'hello' },
          expect.objectContaining({
            role: 'assistant',
            tool_calls: [expect.objectContaining({ id: 'call_search' })]
          })
        ]
      })
    );
    expect(result.completeMessages).toEqual([
      { role: 'user', content: 'hello' },
      expect.objectContaining({
        role: 'assistant',
        tool_calls: [expect.objectContaining({ id: 'call_search' })]
      }),
      { role: 'tool', tool_call_id: 'call_search', content: 'search result' },
      { role: 'assistant', content: 'child answer' }
    ]);
    expect(usagePush).toHaveBeenCalledWith([toolUsage]);
  });

  it('stops the pi agent when a runtime tool requests loop stop', async () => {
    agentToolToExecute.value = {
      name: 'finish_workflow',
      callId: 'call_stop',
      args: {}
    };

    const result = await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        llmParams: { model: 'gpt-5' },
        toolCatalog: {
          runtimeTools: [
            {
              type: 'function',
              function: {
                name: 'finish_workflow',
                description: 'Finish workflow',
                parameters: { type: 'object', properties: {} }
              }
            }
          ]
        },
        executeTool: vi.fn().mockResolvedValue({
          response: 'workflow finished',
          assistantMessages: [],
          usages: [],
          stop: true
        }),
        checkIsStopping: vi.fn(() => false)
      }
    });

    expect(agentAbortMock).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('done');
  });

  it('emits tool_run_end with an error response when a runtime tool throws', async () => {
    const events: any[] = [];
    agentToolToExecute.value = {
      name: 'search',
      callId: 'call_error',
      args: {}
    };

    await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        llmParams: { model: 'gpt-5' },
        toolCatalog: {
          runtimeTools: [
            {
              type: 'function',
              function: {
                name: 'search',
                description: 'Search',
                parameters: { type: 'object', properties: {} }
              }
            }
          ]
        },
        executeTool: vi.fn().mockRejectedValue(new Error('network unavailable')),
        checkIsStopping: vi.fn(() => false),
        emitEvent: (event) => events.push(event)
      }
    });

    expect(events.filter((event) => event.type === 'tool_run_start')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'tool_run_end')).toHaveLength(1);
    expect(events.find((event) => event.type === 'tool_run_end')).toMatchObject({
      call: { id: 'call_error' },
      response: 'Tool error: network unavailable',
      errorMessage: 'Tool error: network unavailable',
      usages: []
    });
  });

  it('resumes child interactive through executeInteractiveTool and continues pi context', async () => {
    const executeInteractiveTool = vi.fn().mockResolvedValue({
      response: 'selected project A',
      assistantMessages: [],
      usages: [],
      stop: false
    });

    const result = await runPiAgentLoop({
      input: {
        messages: [
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_search',
                type: 'function',
                function: {
                  name: 'search',
                  arguments: '{"q":"FastGPT"}'
                }
              }
            ]
          }
        ],
        providerState: {
          piMessages: [
            {
              role: 'toolResult',
              toolCallId: 'call_search',
              toolName: 'search',
              content: [{ type: 'text', text: 'waiting for selection' }],
              details: {},
              isError: false,
              timestamp: 1
            }
          ]
        },
        childrenInteractiveParams: {
          childrenResponse: {
            type: 'userSelect',
            entryNodeIds: ['select_1']
          },
          toolParams: {
            toolCallId: 'call_search'
          }
        }
      },
      runtime: {
        llmParams: { model: 'gpt-5' },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn(),
        executeInteractiveTool,
        checkIsStopping: vi.fn(() => false)
      }
    });

    expect(executeInteractiveTool).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          id: 'call_search',
          function: expect.objectContaining({ name: 'search' })
        })
      })
    );
    expect(agentConstructorArgs.at(-1).initialState.messages).toEqual([
      expect.objectContaining({
        role: 'toolResult',
        toolCallId: 'call_search',
        content: [{ type: 'text', text: 'selected project A' }]
      })
    ]);
    expect(agentContinueMock).toHaveBeenCalledTimes(1);
    expect(agentPromptMock).not.toHaveBeenCalled();
    expect(result.status).toBe('done');
  });

  it('turns a pi interactive tool resume exception into a tool_run_end error', async () => {
    const events: any[] = [];
    const result = await runPiAgentLoop({
      input: {
        messages: [
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_search',
                type: 'function',
                function: {
                  name: 'search',
                  arguments: '{}'
                }
              }
            ]
          },
          {
            role: 'tool',
            tool_call_id: 'call_search',
            content: 'waiting for selection'
          }
        ],
        providerState: {
          piMessages: [
            {
              role: 'toolResult',
              toolCallId: 'call_search',
              toolName: 'search',
              content: [{ type: 'text', text: 'waiting for selection' }],
              details: {},
              isError: false,
              timestamp: 1
            }
          ]
        },
        childrenInteractiveParams: {
          childrenResponse: { type: 'userSelect' },
          toolParams: { toolCallId: 'call_search' }
        }
      },
      runtime: {
        llmParams: { model: 'gpt-5' },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn(),
        executeInteractiveTool: vi.fn().mockRejectedValue(new Error('resume failed')),
        checkIsStopping: vi.fn(() => false),
        emitEvent: (event) => events.push(event)
      }
    });

    expect(events.find((event) => event.type === 'tool_run_end')).toMatchObject({
      call: { id: 'call_search' },
      response: 'Tool error: resume failed',
      errorMessage: 'Tool error: resume failed'
    });
    expect(result.completeMessages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_search',
      content: 'Tool error: resume failed'
    });
    expect(result.status).toBe('done');
  });

  it('injects sandbox tools as system tools and emits sandbox events', async () => {
    const events: any[] = [];
    runSandboxToolsMock.mockResolvedValue({
      success: true,
      input: {
        command: 'pwd'
      },
      response: 'sandbox output',
      durationSeconds: 0.1
    });

    await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        llmParams: {
          model: 'gpt-5'
        },
        systemTools: {
          sandbox: {
            enabled: true,
            client: {} as any
          }
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false),
        emitEvent: (event) => events.push(event)
      }
    });

    const sandboxTool = agentConstructorArgs
      .at(-1)
      .initialState.tools.find((tool: any) => tool.name === 'sandbox_shell');
    expect(sandboxTool).toBeDefined();

    const result = await sandboxTool.execute('call_sandbox', { command: 'pwd' });
    expect(runSandboxToolsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'sandbox_shell',
        args: '{"command":"pwd"}',
        sandboxClient: expect.anything()
      })
    );
    expect(result).toEqual({
      content: [{ type: 'text', text: 'sandbox output' }],
      details: {}
    });
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

  it('adapts llmParams into pi-agent payload without carrying workflow-only fields', async () => {
    await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        llmParams: {
          model: 'gpt-5',
          maxTokens: 2000,
          temperature: 5,
          topP: 0.7,
          stop: '<END>|<STOP>',
          responseFormat: {
            type: 'json_schema',
            json_schema: '{"name":"tool_call","schema":{"type":"object"}}'
          }
        },
        responseParams: {
          retainDatasetCite: false
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false)
      }
    });

    expect(agentPayloadResults.at(-1)).toEqual(
      expect.objectContaining({
        messages: [],
        model: 'gpt-5',
        stream: true,
        max_tokens: 2000,
        temperature: 1,
        top_p: 0.7,
        stop: ['<END>', '<STOP>'],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'tool_call',
            schema: {
              type: 'object'
            }
          }
        }
      })
    );
    expect(agentPayloadResults.at(-1)).not.toHaveProperty('requestOrigin');
    expect(agentPayloadResults.at(-1)).not.toHaveProperty('retainDatasetCite');
  });

  it('applies responseParams.retainDatasetCite when returning piAgent text', async () => {
    agentResponseText.value = 'answer [507f1f77bcf86cd799439011](CITE)';

    const result = await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        llmParams: {
          model: 'gpt-5'
        },
        responseParams: {
          retainDatasetCite: false
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false)
      }
    });

    expect(result.assistantMessages[0]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        content: 'answer '
      })
    );
  });

  it('uses pending ask context when resuming with a user answer', async () => {
    const events: any[] = [];

    await runPiAgentLoop({
      input: {
        messages: [
          {
            role: 'user',
            content: 'latest visible user input'
          }
        ],
        providerState: {
          pendingAsk: {
            question: '请补充目标',
            reason: '需要确认需求范围'
          },
          piMessages: [
            {
              role: 'assistant',
              content: 'previous pi message'
            }
          ]
        },
        userAnswer: '我要分析销售数据'
      },
      runtime: {
        llmParams: {
          model: 'gpt-5'
        },
        toolCatalog: {
          runtimeTools: []
        },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false),
        emitEvent: (event) => events.push(event)
      }
    });

    expect(agentPromptMock).toHaveBeenCalledWith(
      expect.stringContaining('<ask_user_question>请补充目标</ask_user_question>')
    );
    expect(agentPromptMock).toHaveBeenCalledWith(
      expect.stringContaining('<user_answer>我要分析销售数据</user_answer>')
    );
    expect(agentPromptMock).not.toHaveBeenCalledWith('latest visible user input');
    expect(events).toContainEqual({
      type: 'ask_resume',
      answer: '我要分析销售数据'
    });
  });
});
