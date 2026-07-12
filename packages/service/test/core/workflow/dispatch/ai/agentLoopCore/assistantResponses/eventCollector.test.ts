import { createAgentLoopCoreAssistantEventCollector } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/interface';
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
      rawResponse: 'result',
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

  it('persists plan metadata only from its dedicated event', () => {
    const collector = createAgentLoopCoreAssistantEventCollector({
      metaEventNames: {
        updatePlanToolName: 'update_plan'
      }
    });

    collector.emitEvent({
      type: 'plan_operation',
      operation: 'set_plan',
      success: true,
      message: 'plan created',
      id: 'call_plan',
      params: '{"action":"set_plan"}'
    });

    expect(collector.assistantResponses).toEqual([
      {
        id: 'call_plan',
        agentPlanUpdate: {
          id: 'call_plan',
          functionName: 'update_plan',
          params: '{"action":"set_plan"}',
          response: 'plan created'
        }
      }
    ]);
  });

  it('appends tool child assistant messages from tool_run_end', () => {
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
      rawResponse: 'workflow result',
      response: 'workflow result',
      seconds: 0.1,
      assistantMessages: [
        {
          role: 'assistant',
          content: 'child answer',
          tool_calls: [
            {
              id: 'call_nested',
              type: 'function',
              function: {
                name: 'nested_search',
                arguments: '{"query":"FastGPT"}'
              }
            }
          ]
        },
        {
          role: 'tool',
          tool_call_id: 'call_nested',
          content: 'nested result'
        }
      ]
    });
    collector.emitEvent({
      type: 'tool_run_end',
      call,
      rawResponse: 'duplicate',
      response: 'duplicate',
      seconds: 0.2,
      assistantMessages: [{ role: 'assistant', content: 'duplicate child answer' }]
    });

    expect(collector.assistantResponses).toEqual([
      expect.objectContaining({
        id: 'call_workflow',
        tools: [expect.objectContaining({ response: 'workflow result' })]
      }),
      expect.objectContaining({ text: { content: 'child answer' } }),
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            id: 'call_nested',
            toolName: 'Nested search',
            response: 'nested result'
          })
        ]
      })
    ]);
  });
});
