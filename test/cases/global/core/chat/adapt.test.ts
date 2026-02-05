import { describe, expect, it } from 'vitest';
import { chats2GPTMessages } from '@fastgpt/global/core/chat/adapt';
import { ChatItemValueTypeEnum, ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';

describe('chats2GPTMessages reasoning preservation', () => {
  it('should attach reasoning to tool call messages', () => {
    const messages: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            type: ChatItemValueTypeEnum.reasoning,
            reasoning: { content: 'think step' }
          },
          {
            type: ChatItemValueTypeEnum.tool,
            tools: [
              {
                id: 'tool1',
                toolName: '',
                toolAvatar: '',
                functionName: 'doThing',
                params: '{}',
                response: 'ok'
              }
            ]
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
    expect((result[0] as any).reasoning_text).toBe('think step');
    expect((result[0] as any).tool_calls).toHaveLength(1);
  });
});
