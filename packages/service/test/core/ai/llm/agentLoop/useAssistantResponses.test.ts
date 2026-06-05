import { describe, expect, it } from 'vitest';
import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import { useAgentLoopAssistantResponses } from '@fastgpt/service/core/ai/llm/agentLoop/hooks/useAssistantResponses';

const createToolCall = ({
  id,
  name,
  args = ''
}: {
  id: string;
  name: string;
  args?: string;
}): ChatCompletionMessageToolCall => ({
  id,
  type: 'function',
  function: {
    name,
    arguments: args
  }
});

const createPlan = () => ({
  planId: 'plan_1',
  name: 'Investigate',
  description: 'Investigate code',
  steps: [
    {
      id: 'step_1',
      name: 'Read code',
      description: 'Read code',
      status: 'pending' as const
    }
  ]
});

describe('useAgentLoopAssistantResponses', () => {
  it('persists only llm_request_end text and ignores streaming deltas', () => {
    const collector = useAgentLoopAssistantResponses();

    collector.emitEvent({
      type: 'llm_request_start',
      requestIndex: 1,
      modelName: 'GPT-4'
    });
    collector.emitEvent({
      type: 'reasoning_delta',
      text: 'thinking'
    });
    collector.emitEvent({
      type: 'answer_delta',
      text: 'hello'
    });
    collector.emitEvent({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_1',
      finishReason: 'stop',
      answerText: 'hello world',
      reasoningText: 'thinking deeper',
      seconds: 1
    });

    expect(collector.assistantResponses).toEqual([
      {
        reasoning: {
          content: 'thinking deeper'
        },
        text: {
          content: 'hello world'
        }
      }
    ]);
  });

  it('persists runtime tool cards from llm_request_end and tool_run_end only', () => {
    const collector = useAgentLoopAssistantResponses({
      getToolInfo: (functionName) => ({
        name: functionName === 'search' ? 'Search' : functionName,
        avatar: functionName === 'search' ? 'search-avatar' : ''
      })
    });
    const call = createToolCall({
      id: 'call_search',
      name: 'search',
      args: '{"q":"FastGPT"}'
    });

    collector.emitEvent({
      type: 'llm_request_start',
      requestIndex: 1,
      modelName: 'GPT-4'
    });
    collector.emitEvent({
      type: 'tool_call',
      call
    });
    collector.emitEvent({
      type: 'tool_params',
      callId: 'call_search',
      argsDelta: '{"ignored":true}'
    });
    collector.emitEvent({
      type: 'llm_request_end',
      requestIndex: 1,
      modelName: 'GPT-4',
      requestId: 'req_tool',
      finishReason: 'tool_calls',
      answerText: 'I will search.',
      reasoningText: 'Need external data.',
      toolCalls: [call],
      seconds: 1
    });
    collector.emitEvent({
      type: 'tool_run_end',
      call,
      rawResponse: 'Search result',
      response: 'Search result',
      seconds: 1
    });

    expect(collector.assistantResponses).toEqual([
      {
        text: {
          content: 'I will search.'
        },
        reasoning: {
          content: 'Need external data.'
        }
      },
      {
        id: 'call_search',
        tools: [
          {
            id: 'call_search',
            toolName: 'Search',
            toolAvatar: 'search-avatar',
            functionName: 'search',
            params: '{"q":"FastGPT"}',
            response: 'Search result'
          }
        ]
      }
    ]);
  });

  it('keeps plan and ask as independent assistant values instead of tool cards', () => {
    const collector = useAgentLoopAssistantResponses({
      internalToolNames: new Set(['update_plan', 'ask_user']),
      askToolName: 'ask_user'
    });
    const planCall = createToolCall({
      id: 'call_plan',
      name: 'update_plan',
      args: '{"action":"set_plan","name":"Investigate","steps":[{"name":"Read code"}]}'
    });
    const askParams = JSON.stringify({
      reason: 'Missing input',
      blockerType: 'missing_required_input',
      question: 'Which repo should I inspect?',
      options: ['FastGPT', 'Plugin']
    });

    collector.emitEvent({
      type: 'tool_call',
      call: planCall
    });
    collector.emitEvent({
      type: 'plan_operation',
      operation: 'set_plan',
      success: true,
      message: 'ok',
      id: 'call_plan',
      params: '{"action":"set_plan","name":"Investigate","steps":[{"name":"Read code"}]}'
    });
    collector.emitEvent({
      type: 'plan_update',
      plan: createPlan()
    });
    collector.emitEvent({
      type: 'ask_start',
      ask: {
        reason: 'Missing input',
        blockerType: 'missing_required_input',
        question: 'Which repo should I inspect?',
        options: ['FastGPT', 'Plugin']
      },
      id: 'call_ask',
      params: askParams
    });

    expect(collector.assistantResponses).toEqual([
      {
        id: 'call_plan',
        agentPlanUpdate: {
          id: 'call_plan',
          functionName: 'update_plan',
          params: '{"action":"set_plan","name":"Investigate","steps":[{"name":"Read code"}]}',
          response: 'ok'
        }
      },
      {
        id: 'call_ask',
        agentAsk: {
          id: 'call_ask',
          askId: 'call_ask',
          functionName: 'ask_user',
          params: askParams
        }
      }
    ]);
  });

  it('persists hidden context checkpoint and upserts assistant_push values by id', () => {
    const collector = useAgentLoopAssistantResponses();

    collector.emitEvent({
      type: 'after_message_compress',
      requestIds: ['req_1'],
      seconds: 1,
      contextCheckpoint: 'compressed context'
    });
    collector.emitEvent({
      type: 'assistant_push',
      value: {
        id: 'custom_value',
        text: {
          content: 'first'
        }
      }
    });
    collector.emitEvent({
      type: 'assistant_push',
      value: {
        id: 'custom_value',
        reasoning: {
          content: 'merged'
        }
      }
    });

    expect(collector.assistantResponses).toEqual([
      {
        contextCheckpoint: 'compressed context',
        hideInUI: true
      },
      {
        id: 'custom_value',
        text: {
          content: 'first'
        },
        reasoning: {
          content: 'merged'
        }
      }
    ]);
  });
});
