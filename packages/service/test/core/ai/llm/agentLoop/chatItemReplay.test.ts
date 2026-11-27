import { createWorkflowToolInteractive } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/interactive/child';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mockCreateLLMResponseQueue, text, toolCall } from './_mocks/llmQueue';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { AgentLoopRuntime } from '@fastgpt/service/core/ai/llm/agentLoop/domain/runtime';
import { runAgentLoop } from '@fastgpt/service/core/ai/llm/agentLoop/interface/run';
import { useLLMResponseAccumulator } from '@fastgpt/service/core/ai/llm/request/hooks/useLLMResponseAccumulator';
import { loadRequestMessages } from '@fastgpt/service/core/ai/llm/utils';
import {
  runAgentLoopCore,
  runAgentLoopCoreWithSummary
} from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/run';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import { formatAgentAskAnswers } from '@fastgpt/global/core/ai/agent/utils';
import { readAgentLoopCoreActivePlan } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/context/activePlan';
import { appendWorkflowInteractiveValue } from '@fastgpt/global/core/workflow/runtime/utils';
import { WORKFLOW_BUILDER_PREVIEW_TOOL_NAME } from '@fastgpt/global/core/workflow/builder/constants';
import { getWorkflowBuilderPreviewToolResponse } from '@fastgpt/global/core/workflow/builder/utils';

const mocks = vi.hoisted(() => ({ llm: vi.fn(), compress: vi.fn(), sandbox: vi.fn() }));
vi.mock('@fastgpt/service/core/ai/sandbox/application/toolCall', () => ({
  runSandboxTools: mocks.sandbox,
  getSandboxToolInfo: () => ({ name: 'Read file', avatar: '' })
}));
vi.mock('@fastgpt/service/core/ai/llm/request', () => ({ createLLMResponse: mocks.llm }));
vi.mock('@fastgpt/service/core/ai/llm/compress', () => ({
  compressRequestMessages: mocks.compress,
  compressToolResponse: async ({ response }: { response: string }) => ({ compressed: response })
}));
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: async () => 100
}));
vi.mock('@fastgpt/service/support/wallet/usage/utils', () => ({
  formatModelChars2Points: () => ({ totalPoints: 0 })
}));

const model = {
  modelId: 'test',
  name: 'test',
  model: 'test',
  config: { maxContext: 128000, maxResponse: 4096, toolChoice: true, functionCall: true }
} as AgentLoopRuntime['llmParams']['model'];
const ask = {
  reason: 'Need a choice',
  blockerType: 'user_choice' as const,
  questions: [
    {
      question: 'Format?',
      options: [
        { summary: 'Brief', value: 'Keep it brief' },
        { summary: 'Full', value: 'Full details' }
      ]
    }
  ]
};
const call = (id: string, name: string, args: object = {}): ChatCompletionMessageToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: JSON.stringify(args) }
});
const runtime = (overrides: Partial<AgentLoopRuntime> = {}): AgentLoopRuntime => ({
  teamId: 'team',
  llmParams: { model },
  systemTools: { ask: { enabled: true }, plan: { enabled: true } },
  toolCatalog: {
    runtimeTools: ['search', 'write'].map((name) => ({
      type: 'function',
      function: { name, description: name, parameters: { type: 'object', properties: {} } }
    }))
  },
  executeTool: async ({ call }) => ({
    response: `Result ${call.id}`,
    assistantMessages: [],
    usages: [],
    assistantResponses: [{ text: { content: `Child ${call.id}` } }]
  }),
  ...overrides
});
const rebuild = (histories: ChatItemMiniType[]) =>
  chats2GPTMessages({ messages: histories, reserveId: false, reserveTool: true });
/** 比较模型角色、顺序、分组和内容，忽略仅供 UI/关联使用的 dataId。 */
const transcript = (messages: ChatCompletionMessageParam[]) =>
  messages.map(({ dataId: _dataId, ...message }) => message);

describe('FastAgent ChatItem replay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.compress.mockImplementation(async ({ messages }) => ({ messages }));
  });

  it('replays concurrent tools, failed Ask, plan and a valid Ask in the exact response groups', async () => {
    const plan = { name: 'Work', steps: ['Build'] };
    const originalAsk = call('ask', 'ask_user', ask);
    const rawArguments = ` \n${JSON.stringify({ questions: ask.questions, extension: '原始额外字段', blockerType: ask.blockerType, reason: ask.reason }, null, 2)}\n`;
    originalAsk.function.arguments = rawArguments;
    mockCreateLLMResponseQueue(mocks.llm, [
      {
        ...text({ content: 'Research', reasoning: 'Compare sources' }),
        toolCalls: [call('a', 'search'), call('b', 'search')],
        finishReason: 'tool_calls'
      },
      toolCall({ id: 'invalid', name: 'ask_user', args: { reason: 'Missing questions' } }),
      {
        ...text({ content: 'Choose first' }),
        toolCalls: [call('plan', 'set_plan', plan), originalAsk, call('after', 'write')],
        finishReason: 'tool_calls'
      }
    ]);
    const initial: ChatItemMiniType = {
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'Build' } }]
    };
    const completed: string[] = [];
    const result = await runAgentLoopCore({
      provider: 'fastAgent',
      input: { messages: rebuild([initial]) },
      runtime: runtime({
        executeTool: async ({ call }) => {
          if (call.id === 'a') await new Promise((resolve) => setTimeout(resolve, 10));
          completed.push(call.id);
          return {
            response: `Result ${call.id}`,
            assistantMessages: [{ role: 'assistant', content: `Child raw ${call.id}` }],
            assistantResponses: [
              {
                text: { content: `Child ${call.id}` },
                contextCheckpoint: 'Child-only checkpoint',
                plan: {
                  planId: 'child-plan',
                  name: 'Child',
                  steps: [{ id: 'child-step', name: 'Child work', status: 'pending' }]
                }
              }
            ],
            usages: []
          };
        }
      })
    });
    expect(result.status).toBe('interactive');
    expect(completed).toEqual(['b', 'a']);
    const values = result.assistantResponses;
    const research = values.find((value) => value.text?.content === 'Research')!;
    expect(research.tools?.map((tool) => tool.id)).toEqual(['a', 'b']);
    expect(research.reasoning?.content).toBe('Compare sources');
    expect(
      values.find((value) => value.tools?.some((tool) => tool.id === 'invalid'))
    ).toMatchObject({
      hideInUI: true,
      tools: [
        {
          id: 'invalid',
          hideInUI: true,
          params: JSON.stringify({ reason: 'Missing questions' }),
          response: expect.any(String)
        }
      ]
    });
    const interactive = values.find((value) => value.interactive)!;
    expect(interactive.interactive).toMatchObject({
      type: 'agentAsk',
      params: { toolCallId: 'ask', arguments: rawArguments }
    });
    expect(Object.keys(interactive.interactive!.params).sort()).toEqual([
      'arguments',
      'toolCallId'
    ]);
    expect(originalAsk.function.arguments).toBe(rawArguments);
    expect(interactive).not.toHaveProperty('agentAsk');
    expect(interactive.interactive).not.toHaveProperty('askId');
    expect(interactive.tools?.map((tool) => tool.id)).toEqual(['plan', 'after']);
    const human: ChatItemMiniType = {
      obj: ChatRoleEnum.Human,
      value: [
        {
          select: { type: 'agentAsk', questions: [{ question: 'Format?', value: 'Keep it brief' }] }
        }
      ]
    };
    const histories: ChatItemMiniType[] = [initial, { obj: ChatRoleEnum.AI, value: values }, human];
    const expected = result.completeMessages.map((message) =>
      message.role === 'tool' && message.tool_call_id === 'ask'
        ? {
            ...message,
            content: formatAgentAskAnswers({ questions: ask.questions, answers: ['Keep it brief'] })
          }
        : message
    );
    expect(transcript(rebuild(histories))).toEqual(transcript(expected));
    expect(readAgentLoopCoreActivePlan({ histories })).toMatchObject({
      name: 'Work',
      steps: [{ name: 'Build', status: 'pending' }]
    });
    expect(values.filter((value) => value.displayOnly)).toHaveLength(2);
  });

  it('persists a failed Preview as a hidden tool pair without an interactive', async () => {
    mockCreateLLMResponseQueue(mocks.llm, [
      toolCall({ id: 'invalid-preview', name: WORKFLOW_BUILDER_PREVIEW_TOOL_NAME, args: {} }),
      text({ content: 'Correcting the preview' })
    ]);
    const result = await runAgentLoopCore({
      provider: 'fastAgent',
      input: { messages: [] },
      runtime: runtime({
        executeTool: async () => ({
          response: '{"ok":false,"error":"Invalid preview"}',
          hideInUI: true,
          assistantMessages: [],
          usages: []
        })
      })
    });
    expect(result.assistantResponses[0]).toMatchObject({
      hideInUI: true,
      tools: [
        {
          id: 'invalid-preview',
          params: '{}',
          hideInUI: true,
          response: '{"ok":false,"error":"Invalid preview"}'
        }
      ]
    });
    expect(result.assistantResponses.some((value) => value.interactive)).toBe(false);
    expect(
      transcript(rebuild([{ obj: ChatRoleEnum.AI, value: result.assistantResponses }]))
    ).toEqual(transcript(result.completeMessages));
  });

  it('stores a valid Preview once and replays the exact original arguments before and after a Human reply', async () => {
    const rawArguments =
      ' \n' +
      JSON.stringify(
        {
          sections: [{ title: 'Goal', content: 'Build' }],
          extension: 'keep',
          mermaid: 'flowchart TD\n A-->B',
          title: 'Plan'
        },
        null,
        2
      ) +
      '\n';
    const preview = {
      type: 'workflowBuilderPreview' as const,

      params: {
        toolCallId: 'preview-call',
        arguments: rawArguments
      }
    };
    const response = JSON.stringify({
      ok: true,
      state: 'awaiting_confirmation',
      previewId: preview.params.toolCallId,
      taskComplete: false
    });
    mockCreateLLMResponseQueue(mocks.llm, [
      {
        ...text({ content: 'Please confirm', reasoning: 'Plan the workflow' }),
        toolCalls: [
          {
            id: 'preview-call',
            type: 'function',
            function: { name: WORKFLOW_BUILDER_PREVIEW_TOOL_NAME, arguments: rawArguments }
          }
        ],
        finishReason: 'tool_calls'
      }
    ]);
    const initial: ChatItemMiniType = {
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'Build' } }]
    };
    const { result, summary } = await runAgentLoopCoreWithSummary({
      provider: 'fastAgent',
      input: { messages: rebuild([initial]) },
      runtime: runtime({
        executeTool: async () => ({
          response,
          interactive: preview,
          hideInUI: true,
          assistantMessages: [],
          usages: []
        })
      })
    });
    if (!summary.interactive) throw new Error('Expected Preview interactive');
    const values = result.assistantResponses;
    appendWorkflowInteractiveValue({
      values,
      interactive: { ...summary.interactive, entryNodeIds: [], memoryEdges: [], nodeOutputs: [] }
    });
    appendWorkflowInteractiveValue({
      values,
      interactive: { ...summary.interactive, entryNodeIds: [], memoryEdges: [], nodeOutputs: [] }
    });
    expect(values).toHaveLength(1);
    expect(values[0]).not.toHaveProperty('tools');
    expect(values[0].hideInUI).toBe(false);
    expect(values[0].modelResponseId).toEqual(expect.any(String));
    const history: ChatItemMiniType[] = [initial, { obj: ChatRoleEnum.AI, value: values }];
    expect(transcript(rebuild(history))).toEqual(transcript(result.completeMessages));
    const decision = {
      previewId: preview.params.toolCallId,
      action: 'revise' as const,
      feedback: 'Add review'
    };
    const human: ChatItemMiniType = {
      obj: ChatRoleEnum.Human,
      value: [
        {
          select: {
            type: 'workflowBuilderPreview',
            action: 'revise',
            reviseText: decision.feedback
          }
        }
      ]
    };
    const original = structuredClone(values);
    const expected = result.completeMessages.map((message) =>
      message.role === 'tool' && message.tool_call_id === 'preview-call'
        ? { ...message, content: JSON.stringify(getWorkflowBuilderPreviewToolResponse(decision)) }
        : message
    );
    expect(transcript(rebuild([...history, human]))).toEqual(transcript(expected));
    expect(values).toEqual(original);
  });

  it('replays hidden server User continuations between distinct model responses', async () => {
    mockCreateLLMResponseQueue(mocks.llm, [text({ content: 'First' }), text({ content: 'Done' })]);
    const initial: ChatItemMiniType = {
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'Build' } }]
    };
    const result = await runAgentLoopCore({
      provider: 'fastAgent',
      input: { messages: rebuild([initial]) },
      runtime: runtime({
        completionPolicy: ({ requestIndex }) =>
          requestIndex === 1
            ? { action: 'continue', message: 'Verify delivery' }
            : { action: 'complete' }
      })
    });
    expect(result.assistantResponses.filter((value) => value.userMessage)).toEqual([
      { userMessage: { content: 'Verify delivery', source: 'server' }, hideInUI: true }
    ]);
    expect(result.assistantResponses.flatMap((value) => value.tools ?? [])).toHaveLength(0);
    expect(result.completeMessages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant'
    ]);
    expect(
      transcript(rebuild([initial, { obj: ChatRoleEnum.AI, value: result.assistantResponses }]))
    ).toEqual(transcript(result.completeMessages));
  });

  it('keeps legacy Ask and invalid tools out of requests while preserving ordinary human input', () => {
    const histories: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            text: { content: 'Old question' },
            agentAsk: { id: 'old', askId: 'old', functionName: 'ask_user', params: 'broken' }
          },
          { tools: [{ id: 'bad', functionName: '', toolName: '', toolAvatar: '', params: '' }] }
        ]
      },
      { obj: ChatRoleEnum.Human, value: [{ text: { content: 'Continue' } }] }
    ];
    expect(rebuild(histories)).toEqual([
      { dataId: undefined, role: 'assistant', content: 'Old question' },
      { dataId: undefined, role: 'user', content: 'Continue', hideInUI: undefined }
    ]);
  });

  it('restores the actual parent result after two child pauses without duplicating its tool call', async () => {
    const child = {
      type: 'agentAsk' as const,
      params: {
        toolCallId: 'child-ask',
        arguments: JSON.stringify({
          reason: ask.reason,
          blockerType: ask.blockerType,
          questions: ask.questions
        })
      },
      entryNodeIds: [],
      memoryEdges: [],
      nodeOutputs: []
    };
    const initial: ChatItemMiniType = {
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'Build' } }]
    };
    mockCreateLLMResponseQueue(mocks.llm, [toolCall({ id: 'parent-call', name: 'search' })]);
    const first = await runAgentLoopCore({
      provider: 'fastAgent',
      input: { messages: rebuild([initial]) },
      runtime: runtime({
        executeTool: async () => ({
          response: 'Waiting for child',
          interactive: createWorkflowToolInteractive({
            interactive: child,
            toolCallId: 'parent-call'
          }),
          assistantMessages: [],
          usages: []
        })
      })
    });
    appendWorkflowInteractiveValue({
      values: first.assistantResponses,
      interactive: {
        type: 'toolChildrenInteractive',
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: [],
        params: { childrenResponse: child, toolCallId: 'parent-call' }
      }
    });
    const nextChild = { ...child, params: { ...child.params, toolCallId: 'next-child-ask' } };
    const middle = await runAgentLoopCoreWithSummary({
      provider: 'fastAgent',
      input: {
        messages: first.completeMessages,
        childrenInteractiveParams: {
          childrenResponse: child,
          toolCallId: 'parent-call'
        }
      },
      runtime: runtime({
        executeInteractiveTool: async () => ({
          response: 'Waiting for next child',
          interactive: createWorkflowToolInteractive({
            interactive: nextChild,
            toolCallId: 'parent-call'
          }),
          assistantMessages: [],
          usages: []
        })
      })
    });
    expect(middle.summary.status).toBe('interactive');
    expect(middle.summary.interactive?.type).toBe('toolChildrenInteractive');
    expect(mocks.llm).toHaveBeenCalledTimes(1);
    appendWorkflowInteractiveValue({
      values: middle.result.assistantResponses,
      interactive: {
        ...middle.summary.interactive!,
        entryNodeIds: [],
        memoryEdges: [],
        nodeOutputs: []
      }
    });
    mockCreateLLMResponseQueue(mocks.llm, [text({ content: 'Parent finished' })]);
    const second = await runAgentLoopCore({
      provider: 'fastAgent',
      input: {
        messages: middle.result.completeMessages,
        childrenInteractiveParams: {
          childrenResponse: nextChild,
          toolCallId: 'parent-call'
        }
      },
      runtime: runtime({
        executeInteractiveTool: async () => ({
          response: 'Actual child result',
          assistantMessages: [],
          assistantResponses: [{ text: { content: 'Child display' } }],
          usages: []
        })
      })
    });
    const histories: ChatItemMiniType[] = [
      initial,
      { obj: ChatRoleEnum.AI, value: first.assistantResponses },
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            select: {
              type: 'agentAsk',
              questions: [{ question: 'Format?', value: 'Keep it brief' }]
            }
          }
        ]
      },
      { obj: ChatRoleEnum.AI, value: middle.result.assistantResponses },
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            select: {
              type: 'agentAsk',
              questions: [{ question: 'Format?', value: 'Full details' }]
            }
          }
        ]
      },
      { obj: ChatRoleEnum.AI, value: second.assistantResponses }
    ];
    expect(transcript(rebuild(histories))).toEqual(transcript(second.completeMessages));
    expect(second.assistantResponses[0]).toMatchObject({
      toolResponses: [{ id: 'parent-call', response: 'Actual child result' }]
    });
  });

  it('rebuilds only the latest checkpoint and its continuous tail', async () => {
    let count = 0;
    mocks.compress.mockImplementation(async ({ messages }) =>
      ++count === 2
        ? {
            messages: [{ role: 'user', content: 'Summary', hideInUI: true }],
            contextCheckpoint: 'Summary'
          }
        : { messages }
    );
    mockCreateLLMResponseQueue(mocks.llm, [
      toolCall({ id: 'before-compress', name: 'search' }),
      text({ content: 'After compression' })
    ]);
    const initial: ChatItemMiniType = {
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'Old request' } }]
    };
    const result = await runAgentLoopCore({
      provider: 'fastAgent',
      input: { messages: rebuild([initial]) },
      runtime: runtime()
    });
    expect(
      transcript(rebuild([initial, { obj: ChatRoleEnum.AI, value: result.assistantResponses }]))
    ).toEqual(transcript(result.completeMessages));
    expect(result.assistantResponses.some((value) => value.contextCheckpoint === 'Summary')).toBe(
      true
    );
  });

  it('does not invent transcript messages when the completion policy fails', async () => {
    mockCreateLLMResponseQueue(mocks.llm, [text({ content: 'Check' })]);
    const result = await runAgentLoopCore({
      provider: 'fastAgent',
      input: { messages: [] },
      runtime: runtime({
        completionPolicy: () => {
          throw new Error('Check failed');
        }
      })
    });
    expect(result.status).toBe('error');
    expect(
      transcript(rebuild([{ obj: ChatRoleEnum.AI, value: result.assistantResponses }]))
    ).toEqual(transcript(result.completeMessages));
    expect(
      result.assistantResponses.some((value) => value.userMessage || value.tools?.length)
    ).toBe(false);
    expect(String(result.error)).toContain('Check failed');
  });

  it('replays private file context while keeping outward events redacted', async () => {
    const outward: unknown[] = [];
    const request: ChatCompletionMessageParam[][] = [];
    mocks.sandbox.mockResolvedValue({ success: true, response: 'Private runtime fact' });
    mockCreateLLMResponseQueue(mocks.llm, [
      toolCall({ id: 'private', name: 'sandbox_read_file', args: { path: '/private/state.json' } }),
      ({ body }) => {
        request.push(structuredClone(body.messages));
        return text({ content: 'Done' });
      }
    ]);
    const result = await runAgentLoopCore({
      provider: 'fastAgent',
      input: { messages: [] },
      runtime: runtime({
        systemTools: {
          sandbox: {
            enabled: true,
            client: { resolveRuntimePath: (path: string) => path } as never,
            internalReadDirectories: ['/private']
          }
        },
        emitEvent: (event) => outward.push(event)
      })
    });
    const restored = rebuild([{ obj: ChatRoleEnum.AI, value: result.assistantResponses }]);
    expect(transcript(restored.slice(0, -1))).toEqual(transcript(request[0]));
    expect(result.assistantResponses[0].tools?.[0]).toMatchObject({
      internalOnly: true,
      response: 'Private runtime fact'
    });
    expect(JSON.stringify(outward)).not.toContain('/private/state.json');
    expect(JSON.stringify(outward)).not.toContain('Private runtime fact');
  });
  it('preserves the actual rewritten input instead of rebuilding dynamic reminders later', async () => {
    const original: ChatItemMiniType = {
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'Build' } }]
    };
    const prepared =
      '<system-reminder>Skill, working directory, time and file facts</system-reminder>\nBuild';
    mockCreateLLMResponseQueue(mocks.llm, [
      toolCall({ id: 'ask-context', name: 'ask_user', args: ask })
    ]);
    const result = await runAgentLoopCore({
      provider: 'fastAgent',
      input: {
        messages: [{ role: 'user', content: prepared }]
      },
      runtime: runtime(),
      assistantResponses: { persistInputContext: true }
    });
    expect(result.assistantResponses[0].inputContext).toEqual({ content: prepared });
    expect(
      transcript(rebuild([original, { obj: ChatRoleEnum.AI, value: result.assistantResponses }]))
    ).toEqual(transcript(result.completeMessages));
  });

  it('preserves reasoning_content across ChatItem replay even when showReasoning is false', async () => {
    mockCreateLLMResponseQueue(mocks.llm, [
      {
        ...text({ content: 'Step 1', reasoning: 'Analyze hidden reasoning' }),
        toolCalls: [call('ask-reason', 'ask_user', ask)],
        finishReason: 'tool_calls'
      }
    ]);
    const initial: ChatItemMiniType = {
      obj: ChatRoleEnum.Human,
      value: [{ text: { content: 'Plan with hidden reasoning' } }]
    };

    const result = await runAgentLoopCore({
      provider: 'fastAgent',
      input: { messages: rebuild([initial]) },
      runtime: runtime(),
      assistantResponses: { showReasoning: false }
    });

    expect(result.status).toBe('interactive');
    expect(result.assistantResponses[0]).toMatchObject({
      reasoning: { content: 'Analyze hidden reasoning' },
      hideReason: true
    });

    const humanReply: ChatItemMiniType = {
      obj: ChatRoleEnum.Human,
      value: [
        {
          select: { type: 'agentAsk', questions: [{ question: 'Format?', value: 'Keep it brief' }] }
        }
      ]
    };
    const replayed = rebuild([
      initial,
      { obj: ChatRoleEnum.AI, value: result.assistantResponses },
      humanReply
    ]);
    expect(replayed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'assistant',
          reasoning_content: 'Analyze hidden reasoning',
          tool_calls: [expect.objectContaining({ id: 'ask-reason' })]
        })
      ])
    );
  });
});

describe('fastAgent reasoning/thinking field round-trip regression', () => {
  const createReasoningModel = (reasoning: boolean): LLMModelDataType => ({
    modelId: '68ad85a7463006c963799a62',
    type: ModelTypeEnum.llm,
    scope: ModelScopeEnum.system,
    provider: 'openai',
    model: 'deepseek-r1',
    name: 'DeepSeek R1',
    config: {
      maxContext: 128000,
      maxResponse: 4096,
      quoteMaxToken: 60000,
      functionCall: true,
      toolChoice: true,
      reasoning,
      reasoningEffort: true
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.compress.mockImplementation(async ({ messages }) => ({ messages }));
  });

  it.each(['Step 1 deep thinking', ''])(
    'preserves reasoning_content (%j) across multi-turn tool calls when model supports reasoning, and forwards reasoning_effort',
    async (round1Reasoning) => {
      const capturedBodies: Array<{
        messages: ChatCompletionMessageParam[];
        reasoning_effort?: unknown;
        supportReason?: boolean;
      }> = [];
      const events: Array<{ type: string; reasoningText?: string }> = [];

      const searchCall = toolCall({ id: 'call_search_1', name: 'search', args: { q: 'FastGPT' } });
      mocks.llm
        .mockImplementationOnce(async ({ body }) => {
          capturedBodies.push({
            messages: structuredClone(body.messages),
            reasoning_effort: body.reasoning_effort,
            supportReason: body.model.config.reasoning
          });
          // 走真实 useLLMResponseAccumulator 验证思考模型空/非空 reasoning_content 构造不回归
          const accumulator = useLLMResponseAccumulator({
            supportReason: body.model.config.reasoning
          });
          accumulator.appendResponse({
            answerText: '',
            reasoningText: round1Reasoning,
            toolCalls: searchCall.toolCalls,
            finish_reason: 'tool_calls'
          });
          const accumulated = accumulator.getResponse();
          return {
            requestId: 'req_reason_1',
            isStreamResponse: false,
            answerText: accumulated.answerText,
            reasoningText: accumulated.reasoningText,
            toolCalls: accumulated.toolCalls,
            finish_reason: accumulated.finish_reason,
            usage: { inputTokens: 100, outputTokens: 20, usedUserOpenAIKey: false },
            requestMessages: body.messages,
            assistantMessage: accumulated.assistantMessage,
            completeMessages: [...body.messages, accumulated.assistantMessage]
          };
        })
        .mockImplementationOnce(async ({ body }) => {
          capturedBodies.push({
            messages: structuredClone(body.messages),
            reasoning_effort: body.reasoning_effort,
            supportReason: body.model.config.reasoning
          });
          const accumulator = useLLMResponseAccumulator({
            supportReason: body.model.config.reasoning
          });
          accumulator.appendResponse({
            answerText: 'Final reasoned answer',
            reasoningText: 'Step 2 synthesis',
            finish_reason: 'stop'
          });
          const accumulated = accumulator.getResponse();
          return {
            requestId: 'req_reason_2',
            isStreamResponse: false,
            answerText: accumulated.answerText,
            reasoningText: accumulated.reasoningText,
            finish_reason: accumulated.finish_reason,
            usage: { inputTokens: 120, outputTokens: 30, usedUserOpenAIKey: false },
            requestMessages: body.messages,
            assistantMessage: accumulated.assistantMessage,
            completeMessages: [...body.messages, accumulated.assistantMessage]
          };
        });

      const result = await runAgentLoop({
        provider: 'fastAgent',
        input: {
          messages: [{ role: 'user', content: 'Research FastGPT' }]
        },
        runtime: runtime({
          llmParams: {
            model: createReasoningModel(true),
            reasoningEffort: 'high',
            stream: true
          },
          emitEvent: (event) => {
            if (event.type === 'llm_request_end') {
              events.push({ type: event.type, reasoningText: event.reasoningText });
            }
          }
        })
      });

      expect(result.status).toBe('done');
      expect(capturedBodies.map((item) => item.reasoning_effort)).toEqual(['high', 'high']);
      expect(capturedBodies).toHaveLength(2);
      // 第二轮真实经 loadRequestMessages 出站时，必须原样回传首轮思考字段（含空串）
      const outboundSecondTurn = await loadRequestMessages({
        messages: capturedBodies[1].messages,
        supportReason: capturedBodies[1].supportReason
      });
      const serializedSecondTurn = JSON.parse(JSON.stringify(outboundSecondTurn));
      expect(serializedSecondTurn[1]).toMatchObject({
        role: 'assistant',
        reasoning_content: round1Reasoning,
        tool_calls: [expect.objectContaining({ id: 'call_search_1' })]
      });
      expect(events).toEqual([
        { type: 'llm_request_end', reasoningText: round1Reasoning },
        { type: 'llm_request_end', reasoningText: 'Step 2 synthesis' }
      ]);
    }
  );

  it('strips reasoning_content on outbound loadRequestMessages when target model does not support reasoning', async () => {
    const capturedBodies: Array<{
      messages: ChatCompletionMessageParam[];
      supportReason?: boolean;
    }> = [];

    mockCreateLLMResponseQueue(mocks.llm, [
      ({ body }) => {
        capturedBodies.push({
          messages: structuredClone(body.messages),
          supportReason: body.model.config.reasoning
        });
        return text({ content: 'Plain answer' });
      }
    ]);

    const result = await runAgentLoop({
      provider: 'fastAgent',
      input: {
        messages: [
          { role: 'user', content: 'Previous question' },
          {
            role: 'assistant',
            content: 'Previous answer',
            reasoning_content: 'Old model thinking'
          },
          { role: 'user', content: 'Follow-up' }
        ]
      },
      runtime: runtime({
        llmParams: {
          model: createReasoningModel(false),
          stream: true
        }
      })
    });

    expect(result.status).toBe('done');
    expect(capturedBodies).toHaveLength(1);
    const outbound = await loadRequestMessages({
      messages: capturedBodies[0].messages,
      supportReason: capturedBodies[0].supportReason
    });
    const serialized = JSON.parse(JSON.stringify(outbound));
    expect(serialized[1]).toEqual({ role: 'assistant', content: 'Previous answer' });
    expect(serialized[1]).not.toHaveProperty('reasoning_content');
  });
});
