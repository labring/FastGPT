import { describe, expect, it, vi } from 'vitest';
import { SseResponseEventEnum } from '@fastgpt/global/core/chat/stream/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { createSkillEditAgentLoopAdapter } from '@fastgpt/service/core/ai/auxiliaryGeneration/skillEdit/agentLoopAdapter';

const createTool = (name: string) =>
  ({
    type: 'function',
    function: {
      name,
      description: `${name} description`,
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }) as any;

const createToolCall = ({
  id = 'call_custom',
  name = 'custom_tool',
  args = '{"path":"/tmp/a.txt"}'
}: {
  id?: string;
  name?: string;
  args?: string;
} = {}) =>
  ({
    id,
    type: 'function',
    function: {
      name,
      arguments: args
    }
  }) as any;

describe('createSkillEditAgentLoopAdapter', () => {
  it('persists the runtime tool lifecycle and compression response', () => {
    const streamWriter = vi.fn();
    const adapter = createSkillEditAgentLoopAdapter({
      streamWriter,
      lang: 'zh' as any,
      toolCatalog: {
        runtimeTools: [createTool('custom_tool')],
        updatePlanTool: createTool('update_plan'),
        askTool: createTool('ask_agent')
      }
    });
    const call = createToolCall();

    adapter.emitEvent({
      type: 'tool_call',
      call
    });
    adapter.emitEvent({
      type: 'llm_request_end',
      requestIndex: 0,
      requestId: 'req_1',
      modelName: 'GPT-4',
      seconds: 0.5,
      answerText: 'I will inspect the file first.',
      reasoningText: 'Need tool context.',
      toolCalls: [call]
    } as any);
    adapter.emitEvent({
      type: 'tool_response',
      call,
      response: 'tool response',
      seconds: 0.8,
      toolResponseCompress: {
        response: 'compressed tool response',
        usage: {
          moduleName: 'account_usage:tool_response_compress',
          model: 'GPT-4',
          inputTokens: 12,
          outputTokens: 3,
          totalPoints: 0.5
        },
        requestIds: ['', 'req_compress'],
        seconds: 0.2
      }
    } as any);

    expect(adapter.artifacts.assistantResponses).toEqual([
      {
        text: { content: 'I will inspect the file first.' },
        reasoning: { content: 'Need tool context.' }
      },
      {
        id: 'call_custom',
        tools: [
          expect.objectContaining({
            id: 'call_custom',
            functionName: 'custom_tool',
            params: '{"path":"/tmp/a.txt"}',
            response: 'tool response'
          })
        ]
      }
    ]);
    expect(adapter.artifacts.nodeResponses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'call_custom',
          moduleType: FlowNodeTypeEnum.tool,
          moduleName: 'custom_tool',
          toolInput: {
            path: '/tmp/a.txt'
          },
          toolRes: 'tool response',
          childrenResponses: [
            expect.objectContaining({
              id: 'req_compress',
              llmRequestIds: ['req_compress'],
              textOutput: 'compressed tool response'
            })
          ]
        })
      ])
    );
    expect(streamWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        event: SseResponseEventEnum.toolCall
      })
    );
    expect(streamWriter).toHaveBeenCalledWith(
      expect.objectContaining({
        event: SseResponseEventEnum.toolResponse
      })
    );
  });

  it('persists ask_agent and update_plan context without exposing normal tool events', () => {
    const streamWriter = vi.fn();
    const adapter = createSkillEditAgentLoopAdapter({
      streamWriter,
      lang: 'zh' as any,
      toolCatalog: {
        runtimeTools: [createTool('custom_tool')],
        updatePlanTool: createTool('update_plan'),
        askTool: createTool('ask_agent')
      }
    });

    const planCall = createToolCall({
      id: 'call_update_plan',
      name: 'update_plan',
      args: JSON.stringify({ updates: [{ action: 'set_plan' }] })
    });
    const askCall = createToolCall({
      id: 'call_ask_agent',
      name: 'ask_agent',
      args: JSON.stringify({ question: 'Which format?' })
    });

    adapter.emitEvent({ type: 'tool_call', call: planCall });
    adapter.emitEvent({ type: 'tool_call', call: askCall });
    adapter.emitEvent({
      type: 'llm_request_end',
      requestIndex: 0,
      requestId: 'req_control',
      modelName: 'GPT-4',
      seconds: 0.5,
      answerText: 'I need to update the plan and ask one question.',
      reasoningText: 'Need user input.',
      toolCalls: [planCall, askCall]
    } as any);
    adapter.emitEvent({
      type: 'tool_response',
      call: planCall,
      response: 'Plan updated',
      seconds: 0.1
    });
    adapter.emitEvent({
      type: 'tool_response',
      call: askCall,
      response: 'Question created',
      seconds: 0.1
    });
    // Provider retries can replay a completed tool response; persistence must stay idempotent.
    adapter.emitEvent({
      type: 'tool_response',
      call: askCall,
      response: 'Question created',
      seconds: 0.1
    });

    expect(adapter.artifacts.assistantResponses).toEqual([
      {
        id: 'call_update_plan',
        agentPlanUpdate: {
          id: 'call_update_plan',
          functionName: 'update_plan',
          params: planCall.function.arguments,
          response: 'Plan updated',
          assistantText: 'I need to update the plan and ask one question.',
          reasoningText: 'Need user input.'
        }
      },
      {
        id: 'call_ask_agent',
        agentAsk: {
          id: 'call_ask_agent',
          functionName: 'ask_agent',
          params: askCall.function.arguments,
          assistantText: 'I need to update the plan and ask one question.',
          reasoningText: 'Need user input.'
        }
      }
    ]);
    expect(adapter.artifacts.nodeResponses).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agentPlanStatus: 'set_plan',
          textOutput: 'Plan updated'
        }),
        expect.objectContaining({
          agentPlanStatus: 'ask_question',
          textOutput: 'Question created'
        })
      ])
    );
    expect(
      adapter.artifacts.nodeResponses.filter(
        (response: ChatHistoryItemResType) => response.agentPlanStatus === 'ask_question'
      )
    ).toHaveLength(1);
    expect(streamWriter).not.toHaveBeenCalled();
  });
});
