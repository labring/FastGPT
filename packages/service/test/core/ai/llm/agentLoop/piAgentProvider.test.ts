import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

const {
  agentPromptMock,
  agentSubscribeMock,
  agentAbortMock,
  agentConstructorArgs,
  agentPayloadResults,
  agentResponseText,
  runSandboxToolsMock
} = vi.hoisted(() => ({
  agentPromptMock: vi.fn(),
  agentSubscribeMock: vi.fn(),
  agentAbortMock: vi.fn(),
  agentConstructorArgs: [] as any[],
  agentPayloadResults: [] as any[],
  agentResponseText: {
    value: 'pi answer'
  },
  runSandboxToolsMock: vi.fn()
}));

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

vi.mock('@fastgpt/service/core/ai/sandbox/toolCall', () => ({
  runSandboxTools: runSandboxToolsMock,
  getSandboxToolInfo: vi.fn(() => ({
    name: 'Sandbox',
    avatar: 'sandbox-avatar'
  }))
}));

import { runPiAgentLoop } from '@fastgpt/service/core/ai/llm/agentLoop/providers/piAgent';

describe('runPiAgentLoop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    agentConstructorArgs.length = 0;
    agentPayloadResults.length = 0;
    agentResponseText.value = 'pi answer';
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
      answerText: 'pi answer',
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        llmTotalPoints: 1
      },
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

  it('only injects plan and ask internal tools when runtime systemTools enable them', async () => {
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
          ask: { enabled: true }
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
      'ask_user'
    ]);
  });

  it('filters runtime tools that conflict with enabled internal tool names', async () => {
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
    expect(toolNames).toContain('search');
  });

  it('injects sandbox tools as internal tools and emits sandbox events', async () => {
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
          response: 'sandbox output',
          nodeResponse: expect.objectContaining({
            toolId: 'sandbox_shell',
            toolRes: 'sandbox output'
          })
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

    expect(result.answerText).toBe('answer ');
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
