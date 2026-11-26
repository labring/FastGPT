import { describe, expect, it, vi } from 'vitest';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { createAgentLoopCoreEventStream } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/eventStream';

const createCall = (overrides: Record<string, any> = {}) =>
  ({
    id: 'call_search',
    type: 'function',
    function: {
      name: 'search',
      arguments: '{"q":"FastGPT"}'
    },
    ...overrides
  }) as any;

describe('createAgentLoopCoreEventStream', () => {
  it('streams answer, reasoning, tool and plan workflow SSE events', () => {
    const workflowStreamResponse = vi.fn();
    const stream = createAgentLoopCoreEventStream({
      workflowStreamResponse,
      streamAnswer: true,
      streamReasoning: true,
      getToolInfo: () => ({
        name: 'Search',
        avatar: 'tool-avatar'
      })
    });

    stream.streamReasoning('reasoning');
    stream.streamAnswer('answer');
    stream.streamToolCall(createCall());
    stream.streamToolParams({
      callId: 'call_search',
      argsDelta: '"q"'
    });
    stream.streamToolResponse({
      toolCallId: 'call_search',
      response: 'tool response'
    });
    stream.streamPlanStatus('generating');
    stream.streamPlan({ planId: 'plan_1' });
    stream.streamFlowNodeStatus({
      status: 'running',
      name: 'GPT-4'
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(8);
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: SseResponseEventEnum.answer,
        data: expect.objectContaining({
          choices: [
            expect.objectContaining({
              delta: expect.objectContaining({
                reasoning_content: 'reasoning'
              })
            })
          ]
        })
      })
    );
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event: SseResponseEventEnum.answer,
        data: expect.objectContaining({
          choices: [
            expect.objectContaining({
              delta: expect.objectContaining({
                content: 'answer'
              })
            })
          ]
        })
      })
    );
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(3, {
      id: 'call_search',
      event: SseResponseEventEnum.toolCall,
      data: {
        tool: {
          id: 'call_search',
          toolName: 'Search',
          toolAvatar: 'tool-avatar',
          functionName: 'search',
          params: '{"q":"FastGPT"}'
        }
      }
    });
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(4, {
      id: 'call_search',
      event: SseResponseEventEnum.toolParams,
      data: {
        tool: {
          id: 'call_search',
          toolName: '',
          toolAvatar: '',
          params: '"q"'
        }
      }
    });
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(5, {
      id: 'call_search',
      event: SseResponseEventEnum.toolResponse,
      data: {
        tool: {
          id: 'call_search',
          toolName: '',
          toolAvatar: '',
          params: '',
          response: 'tool response'
        }
      }
    });
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(6, {
      id: 'agent-plan-stream',
      event: SseResponseEventEnum.planStatus,
      data: {
        planStatus: {
          status: 'generating'
        }
      }
    });
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(7, {
      id: 'agent-plan-stream',
      event: SseResponseEventEnum.plan,
      data: {
        plan: {
          planId: 'plan_1'
        }
      }
    });
    expect(workflowStreamResponse).toHaveBeenNthCalledWith(8, {
      event: SseResponseEventEnum.flowNodeStatus,
      data: {
        status: 'running',
        name: 'GPT-4'
      }
    });
  });

  it('respects disabled stream channels', () => {
    const workflowStreamResponse = vi.fn();
    const disabled = createAgentLoopCoreEventStream({
      workflowStreamResponse,
      streamAnswer: false,
      streamReasoning: false,
      getToolInfo: () => ({
        name: 'Search'
      })
    });

    disabled.streamReasoning('reasoning');
    disabled.streamAnswer('answer');
    disabled.streamToolCall(createCall());
    disabled.streamToolParams({
      callId: 'call_search',
      argsDelta: '{}'
    });
    disabled.streamToolResponse({
      toolCallId: 'call_search',
      response: 'response'
    });
    disabled.streamPlanStatus('generating');
    disabled.streamPlan({ planId: 'plan_1' });

    expect(workflowStreamResponse).not.toHaveBeenCalled();
  });

  it('streams complete tool responses beyond 10000 characters', () => {
    const workflowStreamResponse = vi.fn();
    const response = `${'a'.repeat(6000)}important middle content${'z'.repeat(6000)}`;
    const stream = createAgentLoopCoreEventStream({
      workflowStreamResponse,
      getToolInfo: () => undefined
    });
    stream.streamToolCall(createCall());
    stream.streamToolResponse({
      toolCallId: 'call_search',
      response
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(1);
    expect(workflowStreamResponse.mock.calls[0][0].data.tool.response).toBe(response);
  });
});
