import { createAgentLoopCoreAssistantEventCollector } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/assistantResponses/eventCollector';
import { describe, expect, it } from 'vitest';

const createToolCall = ({ id, name, args = '{}' }: { id: string; name: string; args?: string }) =>
  ({
    id,
    type: 'function',
    function: {
      name,
      arguments: args
    }
  }) as const;

describe('createAgentLoopCoreAssistantEventCollector', () => {
  it('collects answer, hidden reasoning and runtime tool responses', () => {
    const collector = createAgentLoopCoreAssistantEventCollector({
      showReasoning: false,
      getToolInfo: (name) => ({
        name: name === 'search' ? 'Search' : name,
        avatar: 'tool-avatar'
      })
    });

    collector.emitEvent({
      type: 'reasoning_delta',
      text: 'think'
    });
    collector.emitEvent({
      type: 'answer_delta',
      text: 'Need search.'
    });
    collector.emitEvent({
      type: 'tool_call',
      call: createToolCall({
        id: 'call_search',
        name: 'search',
        args: '{"q":"FastGPT"}'
      })
    });
    collector.emitEvent({
      type: 'tool_run_end',
      call: createToolCall({
        id: 'call_search',
        name: 'search',
        args: '{"q":"FastGPT"}'
      }),
      response: 'result',
      seconds: 0.1
    });

    expect(collector.assistantResponses).toEqual([
      {
        reasoning: {
          content: 'think'
        },
        hideReason: true,
        text: {
          content: 'Need search.'
        }
      },
      {
        id: 'call_search',
        tools: [
          {
            id: 'call_search',
            toolName: 'Search',
            toolAvatar: 'tool-avatar',
            functionName: 'search',
            params: '{"q":"FastGPT"}',
            response: 'result'
          }
        ]
      }
    ]);
  });

  it('inserts unstreamed assistant text before runtime tools on llm_request_end', () => {
    const collector = createAgentLoopCoreAssistantEventCollector({
      getToolInfo: (name) => ({
        name,
        avatar: ''
      })
    });
    const call = createToolCall({
      id: 'call_time',
      name: 'get_time'
    });

    collector.emitEvent({
      type: 'tool_call',
      call
    });
    collector.emitEvent({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_1',
      finishReason: 'tool_calls',
      reasoningText: 'Need time first.',
      toolCalls: [call]
    });

    expect(collector.assistantResponses).toEqual([
      {
        reasoning: {
          content: 'Need time first.'
        }
      },
      {
        id: 'call_time',
        tools: [
          {
            id: 'call_time',
            toolName: 'get_time',
            toolAvatar: '',
            functionName: 'get_time',
            params: '{}'
          }
        ]
      }
    ]);
  });

  it('persists failed plan operations without creating a plan snapshot', () => {
    const collector = createAgentLoopCoreAssistantEventCollector({
      metaEventNames: {
        setPlanToolName: 'set_plan',
        updatePlanToolName: 'update_plan'
      }
    });

    collector.emitEvent({
      type: 'plan_operation',
      operation: 'set_plan',
      success: false,
      message: 'plan creation failed',
      id: 'call_plan',
      params: '{"action":"set_plan"}'
    });

    expect(collector.assistantResponses).toEqual([
      {
        id: 'call_plan',
        agentPlanUpdate: {
          id: 'call_plan',
          functionName: 'set_plan',
          params: '{"action":"set_plan"}',
          response: 'plan creation failed'
        }
      }
    ]);
  });

  it('persists the complete plan as a standalone snapshot', () => {
    const collector = createAgentLoopCoreAssistantEventCollector({
      metaEventNames: {
        setPlanToolName: 'set_plan',
        updatePlanToolName: 'update_plan'
      }
    });

    collector.emitEvent({
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
            name: 'Implement persistence',
            status: 'in_progress'
          }
        ]
      }
    });

    expect(collector.assistantResponses).toEqual([
      {
        plan: {
          planId: 'plan_1',
          name: 'Implementation plan',
          description: null,
          steps: [
            {
              id: 'step_1',
              name: 'Implement persistence',
              status: 'in_progress'
            }
          ]
        }
      },
      {
        id: 'call_plan',
        agentPlanUpdate: {
          id: 'call_plan',
          functionName: 'set_plan',
          params: '{"action":"set_plan"}',
          response: 'plan created'
        }
      }
    ]);
  });

  it('stores child assistant responses after the parent tool result', () => {
    const collector = createAgentLoopCoreAssistantEventCollector({
      getToolInfo: (name) => ({
        name: name === 'nested_search' ? 'Nested search' : name,
        avatar: 'tool-avatar'
      })
    });
    const call = createToolCall({
      id: 'call_workflow',
      name: 'workflow_tool'
    });

    collector.emitEvent({ type: 'tool_call', call });
    collector.emitEvent({
      type: 'tool_run_end',
      call,
      response: 'workflow result',
      seconds: 0.1,
      assistantMessages: [{ role: 'assistant', content: 'context only' }],
      assistantResponses: [
        { text: { content: 'child answer' } },
        {
          id: 'call_nested',
          tools: [
            {
              id: 'call_nested',
              toolName: 'Nested search',
              toolAvatar: 'tool-avatar',
              params: '{"query":"FastGPT"}',
              response: 'nested result',
              functionName: 'nested_search'
            }
          ]
        }
      ]
    });
    collector.emitEvent({
      type: 'tool_run_end',
      call,
      response: 'duplicate',
      seconds: 0.2,
      assistantMessages: [{ role: 'assistant', content: 'duplicate child answer' }],
      assistantResponses: [{ text: { content: 'duplicate child answer' } }]
    });
    collector.emitEvent({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_after_child',
      finishReason: 'stop',
      answerText: 'parent answer',
      seconds: 0.1
    });

    expect(collector.assistantResponses).toEqual([
      expect.objectContaining({
        id: 'call_workflow',
        tools: [expect.objectContaining({ response: 'workflow result' })]
      }),
      { text: { content: 'child answer' } },
      expect.objectContaining({
        id: 'call_nested',
        tools: [expect.objectContaining({ response: 'nested result' })]
      }),
      { text: { content: 'parent answer' } }
    ]);
  });

  it('persists a failed tool result as the tool response', () => {
    const collector = createAgentLoopCoreAssistantEventCollector();
    const call = createToolCall({ id: 'call_failed', name: 'search' });

    collector.emitEvent({ type: 'tool_call', call });
    collector.emitEvent({
      type: 'tool_run_end',
      call,
      response: 'search unavailable',
      errorMessage: 'search unavailable',
      seconds: 0.1
    });

    expect(collector.assistantResponses).toEqual([
      expect.objectContaining({
        id: 'call_failed',
        tools: [expect.objectContaining({ response: 'search unavailable' })]
      })
    ]);
  });
});

describe('persisted protocol context', () => {
  it('retains mixed plan/ask/tool calls in their original reply and excludes child presentation', async () => {
    const { chats2GPTMessages } = await import('@fastgpt/global/core/chat/adapt');
    const { ChatRoleEnum } = await import('@fastgpt/global/core/chat/constants');
    const collector = createAgentLoopCoreAssistantEventCollector();
    const calls = ['set_plan', 'query', 'ask_user'].map((name) =>
      createToolCall({ id: name, name })
    );
    const original = {
      role: 'assistant' as const,
      reasoning_content: 'one response',
      tool_calls: calls
    };
    collector.emitEvent({ type: 'model_context', messages: [] });
    collector.emitEvent({ type: 'model_context', messages: [original] });
    collector.emitEvent({
      type: 'plan_operation',
      operation: 'set_plan',
      success: false,
      id: 'set_plan',
      params: '{}',
      message: 'invalid plan'
    });
    collector.emitEvent({
      type: 'tool_run_end',
      call: calls[1],
      response: 'result',
      seconds: 0,
      assistantResponses: [
        { text: { content: 'child presentation only' } },
        {
          modelMessages: [{ role: 'assistant', content: 'child context only' }],
          contextCheckpoint: 'child checkpoint',
          hideInUI: true
        }
      ]
    });
    const replies = calls.map((call) => ({
      role: 'tool' as const,
      tool_call_id: call.id,
      content: 'result'
    }));
    collector.emitEvent({ type: 'model_context', messages: replies });
    const restored = chats2GPTMessages({
      messages: [
        { obj: ChatRoleEnum.AI, value: JSON.parse(JSON.stringify(collector.assistantResponses)) }
      ],
      reserveId: false,
      reserveTool: true
    });
    expect(restored).toEqual([original, ...replies]);
    expect(
      collector.assistantResponses.some(
        (value) => value.text?.content === 'child presentation only'
      )
    ).toBe(true);
  });

  it('resets to the parent checkpoint and excludes streamed partial calls after an error', async () => {
    const { chats2GPTMessages } = await import('@fastgpt/global/core/chat/adapt');
    const { ChatRoleEnum } = await import('@fastgpt/global/core/chat/constants');
    const collector = createAgentLoopCoreAssistantEventCollector();
    collector.emitEvent({
      type: 'model_context',
      messages: [{ role: 'assistant', content: 'before' }]
    });
    collector.emitEvent({
      type: 'after_message_compress',
      requestIds: ['compress'],
      seconds: 0,
      modelName: 'model',
      contextCheckpoint: 'summary'
    });
    collector.emitEvent({
      type: 'tool_call',
      call: createToolCall({ id: 'partial', name: 'query' })
    });
    collector.emitEvent({ type: 'reasoning_delta', text: 'partial thinking' });
    collector.emitEvent({ type: 'model_context', messages: [] });
    expect(
      chats2GPTMessages({
        messages: [{ obj: ChatRoleEnum.AI, value: collector.assistantResponses }],
        reserveId: false,
        reserveTool: true
      })
    ).toEqual([{ role: 'user', content: 'summary', dataId: undefined, hideInUI: true }]);
  });
});

it('keeps the parent plan and next user input independent from child control metadata', async () => {
  const { chats2GPTMessages } = await import('@fastgpt/global/core/chat/adapt');
  const { readAgentLoopCoreActivePlan } =
    await import('@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/application/context/activePlan');
  const { ChatRoleEnum } = await import('@fastgpt/global/core/chat/constants');
  const collector = createAgentLoopCoreAssistantEventCollector();
  const call = createToolCall({ id: 'parent-tool', name: 'child' });
  const plan = {
    planId: 'parent-plan',
    name: 'Parent',
    description: null,
    steps: [{ id: 'step', name: 'Build', status: 'in_progress' as const }]
  };
  collector.emitEvent({ type: 'model_context', messages: [] });
  collector.emitEvent({
    type: 'plan_operation',
    operation: 'set_plan',
    success: true,
    message: 'planned',
    plan
  });
  collector.emitEvent({
    type: 'model_context',
    messages: [{ role: 'assistant', tool_calls: [call] }]
  });
  collector.emitEvent({
    type: 'tool_run_end',
    call,
    response: 'done',
    seconds: 0,
    assistantResponses: [
      {
        plan: null,
        agentAsk: { id: 'child-ask', askId: 'child-ask', functionName: 'ask_user', params: '{}' },
        contextCheckpoint: 'child summary'
      }
    ]
  });
  collector.emitEvent({
    type: 'model_context',
    messages: [{ role: 'tool', tool_call_id: call.id, content: 'done' }]
  });
  const history = { obj: ChatRoleEnum.AI, value: collector.assistantResponses } as const;
  expect(readAgentLoopCoreActivePlan({ histories: [history] })?.planId).toBe('parent-plan');
  const messages = chats2GPTMessages({
    messages: [
      history,
      { obj: ChatRoleEnum.Human, value: [{ text: { content: 'next requirement' } }] }
    ],
    reserveId: false,
    reserveTool: true
  });
  expect(messages.at(-1)).toMatchObject({ role: 'user', content: 'next requirement' });
  expect(messages.filter((message) => message.role === 'tool')).toHaveLength(1);
});
