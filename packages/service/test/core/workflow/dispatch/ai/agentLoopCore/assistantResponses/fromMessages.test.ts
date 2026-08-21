import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { buildAgentLoopCoreAssistantResponsesFromMessages } from '@fastgpt/service/core/workflow/dispatch/ai/agentLoopCore/adapter/assistantResponses/fromMessages';
import { describe, expect, it } from 'vitest';

describe('buildAgentLoopCoreAssistantResponsesFromMessages', () => {
  it('builds text, reasoning and tool responses from assistant transcript', () => {
    const responses = buildAgentLoopCoreAssistantResponsesFromMessages({
      messages: [
        {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: 'I need a tool',
          reasoning_content: 'Think first',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'search',
                arguments: '{"q":"hello"}'
              }
            }
          ]
        },
        {
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          tool_call_id: 'call_1',
          content: 'tool result'
        }
      ],
      reserveTool: true,
      reserveReason: true,
      getToolInfo: () => ({
        name: 'Search',
        avatar: 'search-avatar'
      })
    });

    expect(responses).toEqual([
      expect.objectContaining({
        text: {
          content: 'I need a tool'
        },
        reasoning: {
          content: 'Think first'
        }
      }),
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            id: 'call_1',
            toolName: 'Search',
            toolAvatar: 'search-avatar',
            functionName: 'search',
            params: '{"q":"hello"}',
            response: 'tool result'
          })
        ]
      })
    ]);
  });

  it('keeps standalone tool responses for child interactive resume', () => {
    const responses = buildAgentLoopCoreAssistantResponsesFromMessages({
      messages: [
        {
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          tool_call_id: 'call_interactive',
          content: 'selected option'
        }
      ],
      reserveTool: true,
      reserveReason: true
    });

    expect(responses).toEqual([
      {
        tools: [
          {
            id: 'call_interactive',
            toolName: '',
            toolAvatar: '',
            functionName: '',
            params: '',
            response: 'selected option'
          }
        ]
      }
    ]);
  });
});
