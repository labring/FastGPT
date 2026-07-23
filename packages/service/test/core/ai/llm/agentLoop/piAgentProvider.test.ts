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
  agentPayloadRepeatCount,
  agentFailAfterPayload,
  agentRunTransformContext,
  agentTransformContextRepeatCount,
  agentResponseText,
  agentToolToExecute,
  runSandboxToolsMock,
  compressRequestMessagesMock
} = vi.hoisted(() => ({
  agentPromptMock: vi.fn(),
  agentContinueMock: vi.fn(),
  agentSubscribeMock: vi.fn(),
  agentAbortMock: vi.fn(),
  agentConstructorArgs: [] as any[],
  agentPayloadResults: [] as any[],
  agentPayloadRepeatCount: { value: 1 },
  agentFailAfterPayload: { value: undefined as string | undefined },
  agentRunTransformContext: { value: false },
  agentTransformContextRepeatCount: { value: 1 },
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
  runSandboxToolsMock: vi.fn(),
  compressRequestMessagesMock: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/compress', () => ({
  compressRequestMessages: compressRequestMessagesMock
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
    const state = {
      messages: [
        {
          role: 'assistant',
          content: 'saved pi message'
        }
      ],
      errorMessage: ''
    };

    return {
      state,
      prompt: async (prompt: any) => {
        await agentPromptMock(prompt);
        try {
          for (let index = 0; index < agentPayloadRepeatCount.value; index++) {
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

            if (agentFailAfterPayload.value) {
              state.errorMessage = agentFailAfterPayload.value;
              return;
            }

            if (index < agentPayloadRepeatCount.value - 1) {
              subscribers.forEach((subscriber) => {
                subscriber({
                  type: 'message_end',
                  message: {
                    role: 'assistant',
                    content: [],
                    usage: { input: 3, output: 2 },
                    stopReason: 'toolUse'
                  }
                });
              });
            }
          }
        } catch (error) {
          state.errorMessage = error instanceof Error ? error.message : String(error);
          return;
        }

        if (agentRunTransformContext.value) {
          const promptMessages = (() => {
            if (Array.isArray(prompt)) return prompt;
            if (typeof prompt !== 'string') return [prompt];
            return [
              {
                role: 'user',
                content: prompt,
                timestamp: 1
              }
            ];
          })();
          const activeContextMessages = [...args.initialState.messages, ...promptMessages];
          for (let index = 0; index < agentTransformContextRepeatCount.value; index++) {
            // pi-agent-core 只消费 transform 返回值，不会自动覆盖 agent.state.messages。
            await args.transformContext?.(activeContextMessages);
          }
        }
        if (agentToolToExecute.value) {
          const pendingTool = agentToolToExecute.value;
          subscribers.forEach((subscriber) => {
            subscriber({
              type: 'message_update',
              assistantMessageEvent: {
                type: 'toolcall_start',
                contentIndex: 0,
                partial: {
                  content: [
                    {
                      type: 'toolCall',
                      id: pendingTool.callId,
                      name: pendingTool.name,
                      arguments: {}
                    }
                  ]
                }
              }
            });
            subscriber({
              type: 'message_update',
              assistantMessageEvent: {
                type: 'toolcall_delta',
                contentIndex: 0,
                delta: JSON.stringify(pendingTool.args),
                partial: {
                  content: [
                    {
                      type: 'toolCall',
                      id: pendingTool.callId,
                      name: pendingTool.name,
                      arguments: pendingTool.args
                    }
                  ]
                }
              }
            });
          });
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
      vision: true,
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
    agentPayloadRepeatCount.value = 1;
    agentFailAfterPayload.value = undefined;
    agentRunTransformContext.value = false;
    agentTransformContextRepeatCount.value = 1;
    agentResponseText.value = 'pi answer';
    agentToolToExecute.value = undefined;
    compressRequestMessagesMock.mockImplementation(async ({ messages }) => ({ messages }));
  });

  it('runs pi-agent-core through the provider contract and returns provider state', async () => {
    const events: any[] = [];
    const usagePush = vi.fn();
    const result = await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }],
        systemPrompt: 'system prompt'
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
    expect(agentConstructorArgs[0].initialState.systemPrompt).toContain(
      '<user_background>\nsystem prompt\n</user_background>'
    );
    expect(agentConstructorArgs[0].initialState.systemPrompt).toContain(
      'set_plan，参数格式为 {"name":"简短计划名","steps":["步骤一","步骤二"]}'
    );
    expect(agentConstructorArgs[0].initialState.systemPrompt).toContain(
      'update_plan，参数格式为 {"updates":[{"id":"已有步骤 id","status":"done","note":"简短结果"}]}'
    );
    expect(agentConstructorArgs[0].toolExecution).toBe('sequential');
    expect(agentConstructorArgs[0].initialState.messages).toEqual([]);
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

  it('preserves multimodal content in the current user prompt', async () => {
    await runPiAgentLoop({
      input: {
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'inspect this image' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,aW1hZ2U=' }
              }
            ]
          }
        ]
      },
      runtime: {
        teamId: 'team_1',
        llmParams: { model: 'gpt-5', useVision: true },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false)
      }
    });

    expect(agentPromptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        content: [
          { type: 'text', text: 'inspect this image' },
          { type: 'image', mimeType: 'image/png', data: 'aW1hZ2U=' }
        ]
      })
    );
  });

  it('seeds pi context from standard history when provider raw state is absent', async () => {
    await runPiAgentLoop({
      input: {
        messages: [
          { role: 'user', content: 'previous question' },
          { role: 'assistant', content: 'previous answer' },
          { role: 'user', content: 'current question' }
        ]
      },
      runtime: {
        teamId: 'team_1',
        llmParams: { model: 'gpt-5' },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false)
      }
    });

    expect(agentPromptMock).toHaveBeenCalledWith('current question');
    expect(agentConstructorArgs[0].initialState.messages).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'previous question'
      }),
      expect.objectContaining({
        role: 'assistant',
        content: [{ type: 'text', text: 'previous answer' }]
      })
    ]);
  });

  it('compresses pi context through the shared checkpoint pipeline', async () => {
    const events: any[] = [];
    const usagePush = vi.fn();
    agentRunTransformContext.value = true;
    compressRequestMessagesMock.mockResolvedValueOnce({
      messages: [{ role: 'user', content: '<context_checkpoint>summary</context_checkpoint>' }],
      usage: {
        moduleName: 'Context compress',
        inputTokens: 10,
        outputTokens: 4,
        totalPoints: 1
      },
      requestIds: ['compress_request_1'],
      contextCheckpoint: '<context_checkpoint>summary</context_checkpoint>'
    });

    const result = await runPiAgentLoop({
      input: {
        messages: [
          { role: 'user', content: 'previous question' },
          { role: 'assistant', content: 'previous answer' },
          { role: 'user', content: 'current question' }
        ]
      },
      runtime: {
        teamId: 'team_1',
        llmParams: { model: 'gpt-5' },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false),
        usagePush,
        emitEvent: (event) => events.push(event)
      }
    });

    expect(compressRequestMessagesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        teamId: 'team_1',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'previous question' }),
          expect.objectContaining({ role: 'user', content: 'current question' })
        ])
      })
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'after_message_compress',
        requestIds: ['compress_request_1'],
        contextCheckpoint: '<context_checkpoint>summary</context_checkpoint>'
      })
    );
    expect(usagePush).toHaveBeenCalledWith([
      expect.objectContaining({
        moduleName: 'Context compress',
        totalPoints: 1
      })
    ]);
    expect(result.contextCheckpoint).toBe('<context_checkpoint>summary</context_checkpoint>');
    expect(result.providerState).toMatchObject({
      piMessages: [
        expect.objectContaining({
          role: 'user',
          content: '<context_checkpoint>summary</context_checkpoint>'
        })
      ]
    });
  });

  it('reuses the compressed transcript for later requests in the same pi run', async () => {
    const events: any[] = [];
    agentRunTransformContext.value = true;
    agentTransformContextRepeatCount.value = 2;
    compressRequestMessagesMock.mockImplementation(async ({ messages }) => {
      const hasCheckpoint = messages.some(
        (message: any) =>
          message.role === 'user' &&
          message.content === '<context_checkpoint>summary</context_checkpoint>'
      );
      if (hasCheckpoint) return { messages };

      return {
        messages: [{ role: 'user', content: '<context_checkpoint>summary</context_checkpoint>' }],
        usage: {
          moduleName: 'Context compress',
          inputTokens: 10,
          outputTokens: 4,
          totalPoints: 1
        },
        requestIds: ['compress_request_1'],
        contextCheckpoint: '<context_checkpoint>summary</context_checkpoint>'
      };
    });

    await runPiAgentLoop({
      input: {
        messages: [
          { role: 'user', content: 'previous question' },
          { role: 'assistant', content: 'previous answer' },
          { role: 'user', content: 'current question' }
        ]
      },
      runtime: {
        teamId: 'team_1',
        llmParams: { model: 'gpt-5' },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false),
        emitEvent: (event) => events.push(event)
      }
    });

    expect(compressRequestMessagesMock).toHaveBeenCalledTimes(2);
    expect(compressRequestMessagesMock.mock.calls[1]?.[0].messages).toEqual([
      { role: 'user', content: '<context_checkpoint>summary</context_checkpoint>' }
    ]);
    expect(events.filter((event) => event.type === 'after_message_compress')).toHaveLength(1);
  });

  it('stops before exceeding maxRunAgentTimes', async () => {
    const events: any[] = [];
    agentPayloadRepeatCount.value = 2;

    const result = await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'keep using tools' }]
      },
      runtime: {
        teamId: 'team_1',
        llmParams: { model: 'gpt-5' },
        maxRunAgentTimes: 1,
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false),
        emitEvent: (event) => events.push(event)
      }
    });

    expect(result.status).toBe('done');
    expect(result.requestIds).toHaveLength(1);
    expect(events.filter((event) => event.type === 'llm_request_start')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'llm_request_end')).toHaveLength(1);
  });

  it('closes a started LLM request when pi-agent-core ends before message_end', async () => {
    const events: any[] = [];
    agentFailAfterPayload.value = 'network unavailable';

    const result = await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: 'hello' }]
      },
      runtime: {
        teamId: 'team_1',
        llmParams: { model: 'gpt-5' },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false),
        emitEvent: (event) => events.push(event)
      }
    });

    expect(result.status).toBe('error');
    expect(events.map((event) => event.type)).toEqual(['llm_request_start', 'llm_request_end']);
    expect(events.at(-1)).toMatchObject({
      finishReason: 'error',
      error: 'network unavailable'
    });
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
      'set_plan',
      'update_plan',
      'ask_user',
      'dataset_search'
    ]);
  });

  it('emits one successful plan operation with the complete plan', async () => {
    const events: any[] = [];
    agentToolToExecute.value = {
      name: 'set_plan',
      callId: 'call_plan',
      args: {
        name: 'Implementation plan',
        steps: ['Merge plan events']
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
            maxFileAmount: 20,
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
                name: 'set_plan',
                description: 'conflicting set plan tool',
                parameters: {}
              }
            },
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
    expect(toolNames.filter((name: string) => name === 'set_plan')).toHaveLength(1);
    expect(toolNames.filter((name: string) => name === 'update_plan')).toHaveLength(1);
    expect(toolNames.filter((name: string) => name === 'ask_user')).toHaveLength(1);
    expect(toolNames.filter((name: string) => name === 'read_files')).toHaveLength(1);
    expect(toolNames.filter((name: string) => name === 'dataset_search')).toHaveLength(1);
    expect(toolNames).toContain('search');
  });

  it('pauses when a runtime tool returns child interactive', async () => {
    agentRunTransformContext.value = true;
    compressRequestMessagesMock.mockResolvedValueOnce({
      messages: [{ role: 'user', content: '<context_checkpoint>summary</context_checkpoint>' }],
      contextCheckpoint: '<context_checkpoint>summary</context_checkpoint>'
    });
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
    expect(result.providerState).toMatchObject({
      piMessages: [
        expect.objectContaining({
          role: 'user',
          content: '<context_checkpoint>summary</context_checkpoint>'
        })
      ]
    });
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

  it('streams runtime tool params and normalizes an empty tool response', async () => {
    const events: any[] = [];
    agentToolToExecute.value = {
      name: 'search',
      callId: 'call_empty_response',
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
        executeTool: vi.fn().mockResolvedValue({
          response: '',
          assistantMessages: [],
          usages: []
        }),
        checkIsStopping: vi.fn(() => false),
        emitEvent: (event) => events.push(event)
      }
    });

    expect(
      events
        .filter((event) =>
          ['tool_call', 'tool_params', 'tool_run_start', 'tool_run_end'].includes(event.type)
        )
        .map((event) => event.type)
    ).toEqual(['tool_call', 'tool_params', 'tool_run_start', 'tool_run_end']);
    expect(events.find((event) => event.type === 'tool_params')).toEqual({
      type: 'tool_params',
      callId: 'call_empty_response',
      argsDelta: '{"q":"FastGPT"}'
    });
    expect(events.find((event) => event.type === 'tool_run_end')).toMatchObject({
      rawResponse: '',
      response: 'none'
    });
    expect(result.completeMessages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_empty_response',
      content: 'none'
    });
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

  it('normalizes an empty child interactive response before continuing pi context', async () => {
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
                  arguments: '{"q":"FastGPT"}'
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
        executeInteractiveTool: vi.fn().mockResolvedValue({
          response: '',
          assistantMessages: [],
          usages: [],
          stop: false
        }),
        checkIsStopping: vi.fn(() => false),
        emitEvent: (event) => events.push(event)
      }
    });

    expect(events.find((event) => event.type === 'tool_run_end')).toMatchObject({
      rawResponse: '',
      response: 'none'
    });
    expect(agentConstructorArgs.at(-1).initialState.messages).toContainEqual(
      expect.objectContaining({
        role: 'toolResult',
        toolCallId: 'call_search',
        content: [{ type: 'text', text: 'none' }]
      })
    );
    expect(result.completeMessages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_search',
      content: 'none'
    });
    expect(agentContinueMock).toHaveBeenCalledTimes(1);
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
    expect(
      events
        .filter((event) =>
          ['tool_call', 'tool_params', 'tool_run_start', 'tool_run_end'].includes(event.type)
        )
        .map((event) => event.type)
    ).toEqual(['tool_call', 'tool_params', 'tool_run_start', 'tool_run_end']);
    expect(events.find((event) => event.type === 'tool_params')).toEqual({
      type: 'tool_params',
      callId: 'call_sandbox',
      argsDelta: '{"command":"pwd"}'
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

  it('stores ask pause as standard pending context without pi messages', async () => {
    agentToolToExecute.value = {
      name: 'ask_user',
      callId: 'call_ask_pause',
      args: {
        question: '请确认目标',
        reason: '需要补充范围',
        blockerType: 'missing_required_input',
        options: ['目标 A', '目标 B', '目标 C']
      }
    };

    const result = await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: '分析销售数据' }]
      },
      runtime: {
        llmParams: { model: 'gpt-5' },
        toolCatalog: { runtimeTools: [] },
        systemTools: { ask: { enabled: true } },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false)
      }
    });

    expect(result.status).toBe('paused');
    expect(result.providerState).toEqual({
      pendingMainContext: {
        askToolCallId: 'call_ask_pause',
        activePlan: undefined,
        messages: [
          { role: 'user', content: '分析销售数据' },
          expect.objectContaining({
            role: 'assistant',
            tool_calls: [expect.objectContaining({ id: 'call_ask_pause' })]
          })
        ]
      }
    });
    expect(result.providerState).not.toHaveProperty('piMessages');
    expect(result.completeMessages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_ask_pause',
      content: 'Waiting for user answer.'
    });
  });

  it('resumes pending ask from standard pending context without injecting a user prompt', async () => {
    const events: any[] = [];

    const result = await runPiAgentLoop({
      input: {
        messages: [
          {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'call_ask',
                type: 'function',
                function: {
                  name: 'ask_user',
                  arguments: '{"question":"请补充目标","reason":"需要确认需求范围"}'
                }
              }
            ]
          }
        ],
        providerState: {
          pendingMainContext: {
            askToolCallId: 'call_ask',
            activePlan: {
              planId: 'plan_1',
              name: '继续计划',
              description: '恢复 ask 后继续执行',
              steps: []
            },
            messages: [
              {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call_ask',
                    type: 'function',
                    function: {
                      name: 'ask_user',
                      arguments: '{"question":"请补充目标","reason":"需要确认需求范围"}'
                    }
                  }
                ]
              }
            ]
          }
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

    expect(agentConstructorArgs.at(-1).initialState.messages).toEqual([
      expect.objectContaining({
        role: 'assistant',
        content: [expect.objectContaining({ type: 'toolCall', id: 'call_ask' })]
      }),
      expect.objectContaining({
        role: 'toolResult',
        toolCallId: 'call_ask',
        content: [{ type: 'text', text: '我要分析销售数据' }]
      })
    ]);
    expect(agentContinueMock).toHaveBeenCalledTimes(1);
    expect(agentPromptMock).not.toHaveBeenCalled();
    expect(result.completeMessages).toContainEqual({
      role: 'tool',
      tool_call_id: 'call_ask',
      content: '我要分析销售数据'
    });
    expect(result.activePlan).toMatchObject({ planId: 'plan_1' });
    expect(result.assistantMessages).not.toContainEqual(
      expect.objectContaining({
        role: 'tool',
        tool_call_id: 'call_ask'
      })
    );
    expect(events).toContainEqual({
      type: 'ask_resume',
      answer: '我要分析销售数据'
    });
  });

  it('returns an error when pending ask state has no ask id', async () => {
    const result = await runPiAgentLoop({
      input: {
        messages: [{ role: 'user', content: '分析销售数据' }],
        providerState: {
          pendingMainContext: {
            messages: [{ role: 'assistant', content: null }]
          }
        },
        userAnswer: '我要分析销售数据'
      },
      runtime: {
        llmParams: { model: 'gpt-5' },
        toolCatalog: { runtimeTools: [] },
        executeTool: vi.fn(),
        checkIsStopping: vi.fn(() => false)
      }
    });

    expect(result).toMatchObject({
      status: 'error',
      completeMessages: [{ role: 'user', content: '分析销售数据' }],
      assistantMessages: [],
      requestIds: [],
      usages: [],
      finishReason: 'error'
    });
    expect(result.error).toEqual(new Error('Pending piAgent ask id is missing.'));
    expect(agentConstructorArgs).toHaveLength(0);
    expect(agentPromptMock).not.toHaveBeenCalled();
    expect(agentContinueMock).not.toHaveBeenCalled();
  });
});
