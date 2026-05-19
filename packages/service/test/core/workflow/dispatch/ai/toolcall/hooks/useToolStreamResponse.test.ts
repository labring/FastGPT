import { describe, expect, it, vi } from 'vitest';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { useToolStreamResponse } from '@fastgpt/service/core/workflow/dispatch/ai/toolcall/hooks/useToolStreamResponse';

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

describe('useToolStreamResponse', () => {
  it('streams reasoning, answer, tool call, params and response preview', () => {
    const workflowStreamResponse = vi.fn();
    const { streamReasoning, streamAnswer, streamToolCall, streamToolParams, streamToolResponse } =
      useToolStreamResponse({
        workflowStreamResponse,
        isResponseAnswerText: true,
        aiChatReasoning: true,
        getToolInfo: () => ({
          type: 'user',
          name: 'Search',
          avatar: 'tool-avatar',
          rawData: {} as any
        })
      });

    streamReasoning('reasoning');
    streamAnswer('answer');
    streamToolCall(createCall());
    streamToolParams({
      call: createCall(),
      argsDelta: '"q"'
    });
    streamToolResponse({
      toolCallId: 'call_search',
      response: 'tool response'
    });

    expect(workflowStreamResponse).toHaveBeenCalledTimes(5);
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
  });

  it('does not stream disabled channels or unknown tool calls', () => {
    const workflowStreamResponse = vi.fn();
    const disabled = useToolStreamResponse({
      workflowStreamResponse,
      isResponseAnswerText: false,
      aiChatReasoning: false,
      getToolInfo: () => ({
        type: 'user',
        name: 'Search',
        rawData: {} as any
      })
    });

    disabled.streamReasoning('reasoning');
    disabled.streamAnswer('answer');
    disabled.streamToolCall(createCall());
    disabled.streamToolParams({
      call: createCall(),
      argsDelta: '{}'
    });
    disabled.streamToolResponse({
      toolCallId: 'call_search'
    });

    const enabledWithoutTool = useToolStreamResponse({
      workflowStreamResponse,
      isResponseAnswerText: true,
      aiChatReasoning: true,
      getToolInfo: () => undefined
    });
    enabledWithoutTool.streamToolCall(createCall());

    expect(workflowStreamResponse).not.toHaveBeenCalled();
  });
});
