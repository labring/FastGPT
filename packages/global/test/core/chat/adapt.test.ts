import { describe, expect, it } from 'vitest';
import {
  GPT2Chat,
  adaptRole_Message2Chat,
  simpleUserContentPart,
  chats2GPTMessages,
  GPTMessages2Chats,
  chatValue2RuntimePrompt,
  runtimePrompt2ChatsValue,
  getSystemPrompt_ChatItemType,
  mergeAssistantFieldMessages
} from '@fastgpt/global/core/chat/adapt';
import { ChatRoleEnum, ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatItemMiniType } from '@fastgpt/global/core/chat/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

describe('GPT2Chat mapping', () => {
  it('should map GPT roles to Chat roles correctly', () => {
    expect(GPT2Chat[ChatCompletionRequestMessageRoleEnum.System]).toBe(ChatRoleEnum.System);
    expect(GPT2Chat[ChatCompletionRequestMessageRoleEnum.User]).toBe(ChatRoleEnum.Human);
    expect(GPT2Chat[ChatCompletionRequestMessageRoleEnum.Assistant]).toBe(ChatRoleEnum.AI);
    expect(GPT2Chat[ChatCompletionRequestMessageRoleEnum.Function]).toBe(ChatRoleEnum.AI);
    expect(GPT2Chat[ChatCompletionRequestMessageRoleEnum.Tool]).toBe(ChatRoleEnum.AI);
  });
});

describe('adaptRole_Message2Chat', () => {
  it('should adapt system role', () => {
    expect(adaptRole_Message2Chat(ChatCompletionRequestMessageRoleEnum.System)).toBe(
      ChatRoleEnum.System
    );
  });

  it('should adapt user role', () => {
    expect(adaptRole_Message2Chat(ChatCompletionRequestMessageRoleEnum.User)).toBe(
      ChatRoleEnum.Human
    );
  });

  it('should adapt assistant role', () => {
    expect(adaptRole_Message2Chat(ChatCompletionRequestMessageRoleEnum.Assistant)).toBe(
      ChatRoleEnum.AI
    );
  });
});

describe('simpleUserContentPart', () => {
  it('should return text string when content has single text item', () => {
    const content = [{ type: 'text' as const, text: 'Hello world' }];
    expect(simpleUserContentPart(content)).toBe('Hello world');
  });

  it('should return array when content has multiple items', () => {
    const content = [
      { type: 'text' as const, text: 'Hello' },
      { type: 'text' as const, text: 'World' }
    ];
    expect(simpleUserContentPart(content)).toEqual(content);
  });

  it('should return array when content has non-text item', () => {
    const content = [
      { type: 'image_url' as const, image_url: { url: 'http://example.com/img.png' } }
    ];
    expect(simpleUserContentPart(content)).toEqual(content);
  });
});

describe('mergeAssistantFieldMessages', () => {
  it('should merge assistant reasoning, text and following tool calls', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need external data.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'I will search first.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{"query":"FastGPT"}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: 'compressed result'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need external data.',
        content: 'I will search first.',
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{"query":"FastGPT"}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: 'compressed result'
      }
    ]);
  });

  it('should merge reasoning with consecutive content and following tool call', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need to explain before tool.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Part 1'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: ' Part 2'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: 'search result'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need to explain before tool.',
        content: 'Part 1 Part 2',
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: 'search result'
      }
    ]);
  });

  it('should merge consecutive assistant text fields', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Part 1'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: ' Part 2'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Part 1 Part 2'
      }
    ]);
  });

  it('should merge reasoning after content into the same assistant payload', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Draft answer.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Second step thinking.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Final answer.'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Draft answer.Final answer.',
        reasoning_content: 'Second step thinking.'
      }
    ]);
  });

  it('should keep reasoning separate when the next assistant message has different visibility', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Hidden reasoning.',
        hideInUI: true
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Visible answer.'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Hidden reasoning.',
        hideInUI: true
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Visible answer.'
      }
    ]);
  });

  it('should keep reasoning separate when the next assistant message has different dataId', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        dataId: 'old-ai',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Reason from another response.'
      },
      {
        dataId: 'current-ai',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Current answer.'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        dataId: 'old-ai',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Reason from another response.'
      },
      {
        dataId: 'current-ai',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Current answer.'
      }
    ]);
  });

  it('should not attach orphan reasoning to tool calls with different dataId', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        dataId: 'old-ai',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Reason from another response.'
      },
      {
        dataId: 'current-ai',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        dataId: 'current-ai',
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: '{}'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        dataId: 'old-ai',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Reason from another response.'
      },
      {
        dataId: 'current-ai',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        dataId: 'current-ai',
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: '{}'
      }
    ]);
  });

  it('should merge consecutive assistant reasoning fields into the next assistant payload', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 1'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 2'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Final answer.'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 1reason 2',
        content: 'Final answer.'
      }
    ]);
  });

  it('should keep orphan assistant reasoning fields', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason only'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason only'
      }
    ]);
  });

  it('should keep DeepSeek reasoning on tool call message when there is no answer text', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need to call the search tool.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{"query":"DeepSeek thinking tool call"}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: 'compressed search result'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need to call the search tool.',
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{"query":"DeepSeek thinking tool call"}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: 'compressed search result'
      }
    ]);
  });

  it('should treat empty assistant content on tool call messages as no answer text', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need to call a tool.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: '',
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: 'compressed result'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need to call a tool.',
        content: '',
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: 'compressed result'
      }
    ]);
  });

  it('should merge consecutive tool call groups into one assistant message', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need weather and time.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Checking both tools.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_weather',
            type: 'function',
            function: {
              name: 'weather',
              arguments: '{"city":"Beijing"}'
            }
          },
          {
            id: 'call_time',
            type: 'function',
            function: {
              name: 'time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_weather',
        content: 'compressed weather'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_time',
        content: 'compressed time'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need weather and time.',
        content: 'Checking both tools.',
        tool_calls: [
          {
            id: 'call_weather',
            type: 'function',
            function: {
              name: 'weather',
              arguments: '{"city":"Beijing"}'
            }
          },
          {
            id: 'call_time',
            type: 'function',
            function: {
              name: 'time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_weather',
        content: 'compressed weather'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_time',
        content: 'compressed time'
      }
    ]);
  });

  it('should attach reasoning to tool call message when tool response is missing', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need a tool.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need a tool.',
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      }
    ]);
  });

  it('should keep already merged reasoning and tool calls idempotent', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need a tool.',
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: '{}'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual(messages);
  });

  it('should keep three consecutive reasoning and tool call turns separate', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 1'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_1',
        content: 'time 1'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 2'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_2',
        content: 'time 2'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 3'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_3',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_3',
        content: 'time 3'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 1',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_1',
        content: 'time 1'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 2',
        tool_calls: [
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_2',
        content: 'time 2'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 3',
        tool_calls: [
          {
            id: 'call_3',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_3',
        content: 'time 3'
      }
    ]);
  });

  it('should merge three consecutive reasoning and content turns together', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 1'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'answer 1'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 2'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'answer 2'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 3'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'answer 3'
      }
    ];

    expect(mergeAssistantFieldMessages(messages)).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 1reason 2reason 3',
        content: 'answer 1answer 2answer 3'
      }
    ]);
  });
});

describe('chats2GPTMessages', () => {
  it('should convert system message', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.System,
        value: [{ text: { content: 'You are a helpful assistant' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.System);
    expect(result[0].content).toBe('You are a helpful assistant');
  });

  it('should skip system message with empty content', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.System,
        value: [{ text: { content: '' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(0);
  });

  it('should convert human message with text', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'Hello' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.User);
    expect(result[0].content).toBe('Hello');
  });

  it('should skip agent ask answers marked with planId', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [
          { text: { content: 'public follow-up' } },
          { text: { content: 'private ask answer' }, planId: 'agentLoopMemory-node_1' }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('public follow-up');
  });

  it('should convert human message with image', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            file: {
              type: ChatFileTypeEnum.image,
              name: 'test.png',
              url: 'http://example.com/test.png',
              key: 'test-key'
            }
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.User);
    expect(Array.isArray(result[0].content)).toBe(true);
    const content = result[0].content as any[];
    expect(content[0].type).toBe('image_url');
    expect(content[0].image_url.url).toBe('http://example.com/test.png');
  });

  it('should convert human message with file', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [
          {
            file: {
              type: ChatFileTypeEnum.file,
              name: 'document.pdf',
              url: 'http://example.com/document.pdf',
              key: 'doc-key'
            }
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    const content = result[0].content as any[];
    expect(content[0].type).toBe('file_url');
    expect(content[0].name).toBe('document.pdf');
  });

  it('should convert AI message with text', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Hello, how can I help?' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
    expect(result[0].content).toBe('Hello, how can I help?');
  });

  it('should concat multiple AI text values', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Part 1' } }, { text: { content: ' Part 2' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Part 1 Part 2');
  });

  it('should preserve dataId when reserveId is true', () => {
    const messages: ChatItemMiniType[] = [
      {
        dataId: 'test-data-id',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'Hello' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: true });

    expect(result[0].dataId).toBe('test-data-id');
  });

  it('should not include dataId when reserveId is false', () => {
    const messages: ChatItemMiniType[] = [
      {
        dataId: 'test-data-id',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'Hello' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result[0].dataId).toBeUndefined();
  });

  it('should keep all messages unchanged when there is no context checkpoint', () => {
    const messages: ChatItemMiniType[] = [
      {
        dataId: 'system',
        obj: ChatRoleEnum.System,
        value: [{ text: { content: 'system prompt' } }]
      },
      {
        dataId: 'user',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'hello' } }]
      },
      {
        dataId: 'assistant',
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'hi' } }]
      }
    ];

    expect(chats2GPTMessages({ messages, reserveId: true })).toEqual([
      {
        dataId: 'system',
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        dataId: 'user',
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'hello'
      },
      {
        dataId: 'assistant',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'hi'
      }
    ]);
  });

  it('should start from the latest context checkpoint and ignore older history', () => {
    const messages: ChatItemMiniType[] = [
      {
        dataId: 'system',
        obj: ChatRoleEnum.System,
        value: [{ text: { content: 'system prompt' } }]
      },
      {
        dataId: 'old-user',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'old user request' } }]
      },
      {
        dataId: 'old-ai',
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'old assistant answer' } }]
      },
      {
        dataId: 'checkpoint-1',
        obj: ChatRoleEnum.AI,
        value: [
          {
            contextCheckpoint: '<context_checkpoint>first checkpoint</context_checkpoint>'
          }
        ]
      },
      {
        dataId: 'after-first',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'after first checkpoint' } }]
      },
      {
        dataId: 'checkpoint-2',
        obj: ChatRoleEnum.AI,
        value: [
          {
            contextCheckpoint: '<context_checkpoint>latest checkpoint</context_checkpoint>'
          }
        ]
      },
      {
        dataId: 'current-user',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'current user request' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: true });

    expect(result).toEqual([
      {
        dataId: 'system',
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'system prompt'
      },
      {
        dataId: 'checkpoint-2',
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: '<context_checkpoint>latest checkpoint</context_checkpoint>',
        hideInUI: true
      },
      {
        dataId: 'current-user',
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'current user request'
      }
    ]);
  });

  it('should ignore values before the checkpoint in the same AI history item', () => {
    const messages: ChatItemMiniType[] = [
      {
        dataId: 'old-user',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'old user request' } }]
      },
      {
        dataId: 'checkpoint-record',
        obj: ChatRoleEnum.AI,
        value: [
          {
            text: {
              content: 'capability response before checkpoint should not leak'
            }
          },
          {
            contextCheckpoint: '<context_checkpoint>checkpoint summary</context_checkpoint>',
            text: {
              content: 'same value text should not be parsed'
            }
          },
          {
            text: {
              content: 'assistant response after checkpoint'
            }
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: '<context_checkpoint>checkpoint summary</context_checkpoint>',
        hideInUI: true
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'assistant response after checkpoint'
      }
    ]);
  });

  it('should parse only values after the checkpoint index in a long assistant response list', () => {
    const values = [
      {
        text: {
          content: 'assistant response 0 before checkpoint'
        }
      },
      {
        contextCheckpoint:
          '<context_checkpoint>checkpoint after first response</context_checkpoint>',
        hideInUI: true
      },
      ...Array.from({ length: 10 }, (_, index) => ({
        text: {
          content: `assistant response ${index + 1} after checkpoint`
        }
      }))
    ];
    const messages: ChatItemMiniType[] = [
      {
        dataId: 'old-user',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'old user request' } }]
      },
      {
        dataId: 'assistant-record',
        obj: ChatRoleEnum.AI,
        value: values
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result[0]).toEqual({
      dataId: undefined,
      role: ChatCompletionRequestMessageRoleEnum.User,
      content: '<context_checkpoint>checkpoint after first response</context_checkpoint>',
      hideInUI: true
    });
    expect(result).not.toContainEqual(
      expect.objectContaining({
        content: 'assistant response 0 before checkpoint'
      })
    );
    const afterCheckpointContent = result
      .slice(1)
      .map((item) => item.content)
      .join('');
    Array.from(
      { length: 10 },
      (_, index) => `assistant response ${index + 1} after checkpoint`
    ).forEach((content) => {
      expect(afterCheckpointContent).toContain(content);
    });
  });

  it('should not attach reasoning that appears before the latest checkpoint', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            reasoning: {
              content: 'Old reasoning before checkpoint'
            }
          },
          {
            contextCheckpoint: '<context_checkpoint>compressed state</context_checkpoint>',
            hideInUI: true
          },
          {
            text: {
              content: 'Answer after checkpoint'
            }
          }
        ]
      }
    ];

    expect(chats2GPTMessages({ messages, reserveId: false })).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: '<context_checkpoint>compressed state</context_checkpoint>',
        hideInUI: true
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Answer after checkpoint'
      }
    ]);
  });

  it('should handle AI message with tool calls when reserveTool is true', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            tools: [
              {
                id: 'tool-1',
                toolName: 'Search',
                toolAvatar: '',
                functionName: 'search_web',
                params: '{"query": "test"}',
                response: '{"results": []}'
              }
            ]
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
    expect((result[0] as any).tool_calls).toBeDefined();
    expect(result[1].role).toBe(ChatCompletionRequestMessageRoleEnum.Tool);
  });

  it('should handle deprecated single tool when reserveTool is true', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            tool: {
              id: 'tool-1',
              toolName: 'Search',
              toolAvatar: '',
              functionName: 'search_web',
              params: '{"query": "test"}',
              response: '{"results": []}'
            }
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
    expect((result[0] as any).tool_calls?.[0].function.name).toBe('search_web');
    expect(result[1].role).toBe(ChatCompletionRequestMessageRoleEnum.Tool);
  });

  it('should filter invalid historical tool records when reserveTool is true', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            tools: [
              {
                id: 'call_valid',
                toolName: 'Search',
                toolAvatar: '',
                functionName: 'search_web',
                params: '{"query":"valid"}',
                response: '{"results":[]}'
              },
              {
                id: 'call_empty_name',
                toolName: 'Broken',
                toolAvatar: '',
                functionName: '',
                params: '{"query":"should not leak"}',
                response: 'broken'
              },
              {
                id: '',
                toolName: 'Broken',
                toolAvatar: '',
                functionName: 'search_web',
                params: '{"query":"missing id"}',
                response: 'broken'
              }
            ]
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toHaveLength(2);
    expect((result[0] as any).tool_calls).toEqual([
      {
        id: 'call_valid',
        type: 'function',
        function: {
          name: 'search_web',
          arguments: '{"query":"valid"}'
        }
      }
    ]);
    expect(result[1]).toMatchObject({
      role: ChatCompletionRequestMessageRoleEnum.Tool,
      tool_call_id: 'call_valid',
      content: '{"results":[]}'
    });
  });

  it('should not create empty tool_calls when all historical tools are invalid', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          { reasoning: { content: 'Need a tool' } },
          {
            tools: [
              {
                id: 'call_empty_name',
                toolName: 'Broken',
                toolAvatar: '',
                functionName: '',
                params: '{"query":"broken"}',
                response: 'broken'
              }
            ]
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need a tool'
      }
    ]);
  });

  it('should normalize non-string historical tool params before restoring tool_calls', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            tool: {
              id: 'call_object_params',
              toolName: 'Search',
              toolAvatar: '',
              functionName: 'search_web',
              params: { query: 'object params' },
              response: 'ok'
            } as any
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect((result[0] as any).tool_calls?.[0].function).toEqual({
      name: 'search_web',
      arguments: '{"query":"object params"}'
    });
    expect(result[1]).toMatchObject({
      role: ChatCompletionRequestMessageRoleEnum.Tool,
      tool_call_id: 'call_object_params',
      content: 'ok'
    });
  });

  it('should fallback to empty object arguments when historical tool params cannot stringify', () => {
    const circularParams: Record<string, unknown> = {};
    circularParams.self = circularParams;
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            tool: {
              id: 'call_circular_params',
              toolName: 'Search',
              toolAvatar: '',
              functionName: 'search_web',
              params: circularParams,
              response: 'ok'
            } as any
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect((result[0] as any).tool_calls?.[0].function).toEqual({
      name: 'search_web',
      arguments: '{}'
    });
  });

  it('should keep continuous assistant text, reasoning and following tool_calls together', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            text: { content: 'I will search first.' },
            reasoning: { content: 'Need external data.' },
            tools: [
              {
                id: 'call_search',
                toolName: 'Search',
                toolAvatar: '',
                functionName: 'search_web',
                params: '{"query":"FastGPT"}',
                response: 'compressed result'
              }
            ]
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'I will search first.',
        reasoning_content: 'Need external data.',
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{"query":"FastGPT"}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: 'compressed result'
      }
    ]);
  });

  it('should not skip tool calls when the same value also has empty text', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            text: {
              content: ''
            },
            tools: [
              {
                id: 'call_search',
                toolName: 'Search',
                toolAvatar: '',
                functionName: 'search_web',
                params: '{}',
                response: 'compressed result'
              }
            ]
          },
          {
            text: {
              content: 'Final answer'
            }
          }
        ]
      }
    ];

    expect(chats2GPTMessages({ messages, reserveId: false, reserveTool: true })).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: 'compressed result'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Final answer'
      }
    ]);
  });

  it('should skip empty AI text values when there are multiple values', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: '' } }, { text: { content: 'Valid content' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Valid content');
  });

  it('should handle human message with mixed text and files', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [
          { text: { content: 'Check this image:' } },
          {
            file: {
              type: ChatFileTypeEnum.image,
              name: 'test.png',
              url: 'http://example.com/test.png'
            }
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    const content = result[0].content as any[];
    expect(content).toHaveLength(2);
    expect(content[0].type).toBe('text');
    expect(content[1].type).toBe('image_url');
  });

  it('should preserve hideInUI property', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'Hidden message' } }],
        hideInUI: true
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect((result[0] as any).hideInUI).toBe(true);
  });

  it('should keep hideReason independent from GPT context visibility', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            reasoning: {
              content: 'Hidden in UI but still part of reasoning history'
            },
            text: {
              content: 'Visible answer'
            },
            hideReason: true
          }
        ]
      }
    ];

    expect(chats2GPTMessages({ messages, reserveId: false })).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Hidden in UI but still part of reasoning history',
        content: 'Visible answer'
      }
    ]);
  });

  it('should keep value-level reasoning separate when hideInUI prevents attaching to visible text', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            reasoning: {
              content: 'Hidden reasoning'
            },
            hideInUI: true
          },
          {
            text: {
              content: 'Visible answer'
            }
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toEqual([
      {
        dataId: undefined,
        hideInUI: true,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Hidden reasoning'
      },
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Visible answer'
      }
    ]);
  });

  it('should handle interactive agentPlanAskQuery', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            interactive: {
              type: 'agentPlanAskQuery',
              params: {
                content: 'What would you like to know?'
              }
            }
          } as any
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(0);
  });

  it('should skip plan card when building GPT messages', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            plan: {
              planId: 'plan-1',
              task: 'Search for information',
              description: 'Search the web for relevant data',
              background: 'User needs current information',
              steps: [
                { id: 'step-1', title: 'Step 1: Search' },
                { id: 'step-2', title: 'Step 2: Analyze' }
              ]
            }
          } as any,
          {
            id: 'step-1',
            text: { content: 'Search results here' }
          } as any,
          {
            id: 'step-2',
            text: { content: 'Analysis complete' }
          } as any
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
    expect(result[0].content).toBe('Search results hereAnalysis complete');
  });

  it('should not convert multiple plan cards into GPT tool calls', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            plan: {
              planId: 'plan-1',
              task: 'Task 1',
              description: 'Description 1',
              background: 'Background 1',
              steps: []
            }
          } as any,
          {
            plan: {
              planId: 'plan-2',
              task: 'Task 1 duplicate',
              description: 'Description 1 duplicate',
              background: 'Background 1 duplicate',
              steps: []
            }
          } as any
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toHaveLength(0);
  });

  it('should keep AI message with reasoning only', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ reasoning: { content: 'Let me think...' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Let me think...'
      }
    ]);
  });

  it('should merge reasoning + text into a single assistant message', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          { reasoning: { content: 'Let me think...' } },
          { text: { content: 'Final answer' } }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
    expect((result[0] as any).reasoning_content).toBe('Let me think...');
    expect((result[0] as any).content).toBe('Final answer');
  });

  it('should concatenate continuous reasoning values before attaching to text', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          { reasoning: { content: 'reason 1' } },
          { reasoning: { content: 'reason 2' } },
          { text: { content: 'Final answer' } }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 1reason 2',
        content: 'Final answer'
      }
    ]);
  });

  it('should remove reasoning when reserveReason is false', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          { reasoning: { content: 'hidden thought' } },
          { text: { content: 'Visible answer' } }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveReason: false });

    expect(result).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Visible answer'
      }
    ]);
  });

  it('should keep tool calls and remove reasoning when reserveReason is false', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            reasoning: {
              content: 'Do not send this reasoning'
            },
            tools: [
              {
                id: 'tool-1',
                toolName: 'Search',
                toolAvatar: '',
                functionName: 'search_web',
                params: '{"q":"x"}',
                response: '{"ok":true}'
              }
            ]
          }
        ]
      }
    ];

    expect(
      chats2GPTMessages({
        messages,
        reserveId: false,
        reserveTool: true,
        reserveReason: false
      })
    ).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'tool-1',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{"q":"x"}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'tool-1',
        content: '{"ok":true}'
      }
    ]);
  });

  it('should attach preceding reasoning to following tool_calls', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          { reasoning: { content: 'Need to call a tool' } },
          {
            tools: [
              {
                id: 'tool-1',
                toolName: 'Search',
                toolAvatar: '',
                functionName: 'search_web',
                params: '{"q":"x"}',
                response: '{}'
              }
            ]
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
    expect((result[0] as any).reasoning_content).toBe('Need to call a tool');
    expect((result[0] as any).tool_calls).toHaveLength(1);
    expect((result[0] as any).tool_calls[0].function.name).toBe('search_web');
    expect(result[1].role).toBe(ChatCompletionRequestMessageRoleEnum.Tool);
  });

  it('should keep preceding text together with following continuous tool_calls', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          { text: { content: 'Calling tool' } },
          {
            tools: [
              {
                id: 'tool-1',
                toolName: 'Search',
                toolAvatar: '',
                functionName: 'search_web',
                params: '{}',
                response: '{}'
              }
            ]
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toHaveLength(2);
    expect((result[0] as any).content).toBe('Calling tool');
    expect((result[0] as any).tool_calls).toHaveLength(1);
    expect((result[0] as any).tool_calls[0].function.name).toBe('search_web');
    expect(result[1].role).toBe(ChatCompletionRequestMessageRoleEnum.Tool);
  });

  it('should not drop later fields when a control field shares the same chat value', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            agentPlanUpdate: {
              id: 'call_plan',
              functionName: 'update_plan',
              params: '{"updates":[]}',
              response: 'Plan updated.',
              assistantText: 'updating plan'
            },
            text: {
              content: 'continuing after plan'
            }
          }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'updating plan',
        tool_calls: [
          {
            id: 'call_plan',
            type: 'function',
            function: {
              name: 'update_plan',
              arguments: '{"updates":[]}'
            }
          }
        ]
      },
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_plan',
        content: 'Plan updated.'
      },
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'continuing after plan'
      }
    ]);
  });

  it('should keep control assistant text and reasoning when control tool metadata is invalid', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            agentPlanUpdate: {
              id: '',
              functionName: '',
              params: '{}',
              response: 'Plan updated.',
              assistantText: 'draft before invalid control tool',
              reasoningText: 'planning'
            }
          }
        ]
      }
    ];

    expect(chats2GPTMessages({ messages, reserveId: false, reserveTool: true })).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'planning',
        content: 'draft before invalid control tool'
      }
    ]);
  });

  it('should restore agent loop control fields from chat value when reserving tools', () => {
    const expectedMessages: ChatCompletionMessageParam[] = [
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'draft before plan',
        reasoning_content: 'planning',
        tool_calls: [
          {
            id: 'call_plan',
            type: 'function',
            function: {
              name: 'update_plan',
              arguments: '{"updates":[]}'
            }
          }
        ]
      },
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_plan',
        content: 'Plan updated.'
      },
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'too early',
        reasoning_content: 'checking'
      },
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: '<stop_gate_feedback>\nYou cannot finish yet.\n</stop_gate_feedback>'
      },
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'final answer'
      }
    ];
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            plan: {
              planId: 'plan_1',
              task: 'Task',
              description: 'Task description',
              steps: []
            }
          },
          {
            agentPlanUpdate: {
              id: 'call_plan',
              functionName: 'update_plan',
              params: '{"updates":[]}',
              response: 'Plan updated.',
              assistantText: 'draft before plan',
              reasoningText: 'planning'
            }
          },
          {
            agentStopGate: {
              id: 'stop_gate_1',
              reason: 'Active plan is not complete.',
              feedback: '<stop_gate_feedback>\nYou cannot finish yet.\n</stop_gate_feedback>',
              assistantText: 'too early',
              reasoningText: 'checking'
            }
          },
          {
            text: { content: 'final answer' }
          }
        ]
      }
    ];

    expect(chats2GPTMessages({ messages, reserveId: false, reserveTool: true })).toEqual(
      expectedMessages
    );
    expect(chats2GPTMessages({ messages, reserveId: false, reserveTool: false })).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'final answer'
      }
    ]);
  });

  it('should restore ask_agent tool response from the matching interactive answer', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            agentAsk: {
              id: 'call_ask',
              planId: 'plan_1',
              functionName: 'ask_agent',
              params: '{"question":"Need confirmation?"}',
              assistantText: 'Need confirmation.',
              reasoningText: 'The plan needs user input.'
            }
          },
          {
            interactive: {
              type: 'agentPlanAskQuery',
              planId: 'plan_1',
              params: {
                content: 'Need confirmation?',
                answer: 'Confirmed.'
              }
            }
          }
        ]
      }
    ];

    expect(chats2GPTMessages({ messages, reserveId: false, reserveTool: true })).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'The plan needs user input.',
        content: 'Need confirmation.',
        tool_calls: [
          {
            id: 'call_ask',
            type: 'function',
            function: {
              name: 'ask_agent',
              arguments: '{"question":"Need confirmation?"}'
            }
          }
        ]
      },
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_ask',
        content: 'Confirmed.'
      }
    ]);
  });

  it('should handle multiple reasoning values by merging consecutive assistant entries', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          { reasoning: { content: 'Step 1 thinking' } },
          { text: { content: 'Intermediate answer' } },
          { reasoning: { content: 'Step 2 thinking' } },
          { text: { content: 'Final answer' } }
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    expect((result[0] as any).reasoning_content).toBe('Step 1 thinkingStep 2 thinking');
    expect((result[0] as any).content).toBe('Intermediate answerFinal answer');
  });

  it('should keep multi-step reasoning and tool calls attached without reasoning-only messages', () => {
    const messages: ChatItemMiniType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          { reasoning: { content: 'reason 1' } },
          {
            tools: [
              {
                id: 'call_1',
                toolName: 'Get time',
                toolAvatar: '',
                functionName: 'get_time',
                params: '{}',
                response: '{"time":"17:19:15"}'
              }
            ]
          },
          { reasoning: { content: 'reason 2' } },
          {
            tools: [
              {
                id: 'call_2',
                toolName: 'Get time',
                toolAvatar: '',
                functionName: 'get_time',
                params: '{}',
                response: '{"time":"17:19:16"}'
              }
            ]
          },
          { reasoning: { content: 'reason 3' } },
          { text: { content: 'Final answer' } }
        ]
      }
    ];

    const withTools = chats2GPTMessages({
      messages,
      reserveId: false,
      reserveTool: true,
      reserveReason: true
    });
    const classifyLike = chats2GPTMessages({
      messages,
      reserveId: false,
      reserveTool: false,
      reserveReason: false
    });

    expect(withTools).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 1',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_1',
        content: '{"time":"17:19:15"}'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 2',
        tool_calls: [
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_2',
        content: '{"time":"17:19:16"}'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 3',
        content: 'Final answer'
      }
    ]);
    expect(
      withTools.every(
        (item) =>
          item.role !== ChatCompletionRequestMessageRoleEnum.Assistant ||
          Boolean((item as any).content) ||
          Boolean((item as any).tool_calls)
      )
    ).toBe(true);
    expect(classifyLike).toEqual([
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Final answer'
      }
    ]);
  });
});

describe('GPTMessages2Chats', () => {
  it('should convert system message', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: 'You are a helpful assistant'
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].obj).toBe(ChatRoleEnum.System);
    expect(result[0].value[0].text?.content).toBe('You are a helpful assistant');
  });

  it('should convert user message with string content', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'Hello'
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].obj).toBe(ChatRoleEnum.Human);
    expect(result[0].value[0].text?.content).toBe('Hello');
  });

  it('should convert user message with array content', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: [
          { type: 'text', text: 'Hello' },
          { type: 'image_url', image_url: { url: 'http://example.com/img.png' } }
        ]
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].obj).toBe(ChatRoleEnum.Human);
    expect(result[0].value).toHaveLength(2);
    expect(result[0].value[0].text?.content).toBe('Hello');
    const fileValue = result[0].value[1] as { file?: { type: string } };
    expect(fileValue.file?.type).toBe(ChatFileTypeEnum.image);
  });

  it('should convert assistant message with string content', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Hello, how can I help?'
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].obj).toBe(ChatRoleEnum.AI);
    expect(result[0].value[0].text?.content).toBe('Hello, how can I help?');
  });

  it('should handle reasoning text in assistant message', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Final answer',
        reasoning_content: 'Let me think about this...'
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].value).toEqual([
      {
        reasoning: {
          content: 'Let me think about this...'
        },
        text: {
          content: 'Final answer'
        }
      }
    ]);
  });

  it('should merge separated reasoning assistant messages before following content', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 1'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'reason 2'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Final answer'
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].value).toEqual([
      {
        reasoning: {
          content: 'reason 1reason 2'
        },
        text: {
          content: 'Final answer'
        }
      }
    ]);
  });

  it('should merge separated reasoning before a target that already has reasoning', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'pending reason'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'target reason',
        content: 'Final answer'
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].value).toEqual([
      {
        reasoning: {
          content: 'pending reasontarget reason'
        },
        text: {
          content: 'Final answer'
        }
      }
    ]);
  });

  it('should ignore separated reasoning across non-assistant message boundaries', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Reason before user boundary'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'New user turn'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Answer after user turn'
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toEqual([
      {
        dataId: undefined,
        obj: ChatRoleEnum.AI,
        value: [
          {
            reasoning: {
              content: 'Reason before user boundary'
            }
          }
        ]
      },
      {
        dataId: undefined,
        obj: ChatRoleEnum.Human,
        hideInUI: undefined,
        value: [
          {
            text: {
              content: 'New user turn'
            }
          }
        ]
      },
      {
        dataId: undefined,
        obj: ChatRoleEnum.AI,
        value: [
          {
            text: {
              content: 'Answer after user turn'
            }
          }
        ]
      }
    ]);
  });

  it('should merge separated reasoning assistant message before following tool calls', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Need current time.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_time',
            type: 'function',
            function: {
              name: 'get_time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_time',
        content: '{"time":"2026-05-21 17:19:15"}'
      }
    ];

    const result = GPTMessages2Chats({ messages, reserveTool: true });

    expect(result).toHaveLength(1);
    expect(result[0].value).toEqual([
      {
        reasoning: {
          content: 'Need current time.'
        },
        tools: [
          {
            id: 'call_time',
            toolName: '',
            toolAvatar: '',
            functionName: 'get_time',
            params: '{}',
            response: '{"time":"2026-05-21 17:19:15"}'
          }
        ]
      }
    ]);
  });

  it('should not attach separated reasoning to a later answer after filtered tool calls', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Reasoning for a tool call only.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_search',
        content: '{}'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Final visible answer.'
      }
    ];

    const result = GPTMessages2Chats({ messages, reserveTool: false, reserveReason: true });

    expect(result).toHaveLength(1);
    expect(result[0].value).toEqual([
      {
        reasoning: {
          content: 'Reasoning for a tool call only.'
        }
      },
      {
        text: {
          content: 'Final visible answer.'
        }
      }
    ]);
  });

  it('should merge reasoning and text while filtering tool calls without tool response', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Reasoning for a filtered tool call.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Final visible answer.'
      }
    ];

    const result = GPTMessages2Chats({ messages, reserveTool: false, reserveReason: true });

    expect(result).toHaveLength(1);
    expect(result[0].value).toEqual([
      {
        reasoning: {
          content: 'Reasoning for a filtered tool call.'
        },
        text: {
          content: 'Final visible answer.'
        }
      }
    ]);
  });

  it('should keep tool calls without tool response when reserveTool is true', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Reasoning for a filtered tool call.'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_search',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Final visible answer.'
      }
    ];

    const result = GPTMessages2Chats({ messages, reserveTool: true, reserveReason: true });

    expect(result).toHaveLength(1);
    expect(result[0].value).toEqual([
      {
        reasoning: {
          content: 'Reasoning for a filtered tool call.'
        },
        text: {
          content: 'Final visible answer.'
        }
      },
      {
        tools: [
          {
            id: 'call_search',
            toolName: '',
            toolAvatar: '',
            functionName: 'search_web',
            params: '{}',
            response: ''
          }
        ]
      }
    ]);
  });

  it('should drop reasoning when reserveReason is false', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Final answer',
        reasoning_content: 'Let me think about this...'
      }
    ];

    const result = GPTMessages2Chats({ messages, reserveReason: false });

    expect(result).toHaveLength(1);
    expect(result[0].value).toHaveLength(1);
    expect(result[0].value[0].text?.content).toBe('Final answer');
    expect((result[0].value[0] as any).reasoning).toBeUndefined();
  });

  it('should keep reasoning when assistant message has no content', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: '',
        reasoning_content: 'Thinking only'
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].value).toEqual([
      {
        reasoning: {
          content: 'Thinking only'
        }
      }
    ]);
  });

  it('should merge messages with same dataId', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        dataId: 'same-id',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Part 1'
      },
      {
        dataId: 'same-id',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Part 2'
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].value).toEqual([
      {
        text: {
          content: 'Part 1Part 2'
        }
      }
    ]);
  });

  it('should filter out empty value items', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: ''
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(0);
  });

  it('should convert user message with file_url content', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: [
          { type: 'file_url', name: 'document.pdf', url: 'http://example.com/doc.pdf', key: 'key1' }
        ]
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    const fileValue = result[0].value[0] as { file?: { type: string; name: string } };
    expect(fileValue.file?.type).toBe(ChatFileTypeEnum.file);
    expect(fileValue.file?.name).toBe('document.pdf');
  });

  it('should convert user message with file_url content without name', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: [{ type: 'file_url', url: 'http://example.com/doc.pdf', key: 'key1' }]
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    const fileValue = result[0].value[0] as { file?: { type: string; name: string } };
    expect(fileValue.file?.type).toBe(ChatFileTypeEnum.file);
    expect(fileValue.file?.name).toBe('');
  });

  it('should convert system message with array content', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.System,
        content: [{ type: 'text', text: 'System prompt part 1' }]
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].obj).toBe(ChatRoleEnum.System);
    expect(result[0].value[0].text?.content).toBe('System prompt part 1');
  });

  it('should handle tool_calls in assistant message with reserveTool true', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{"query": "test"}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_1',
        content: '{"results": []}'
      }
    ];

    const result = GPTMessages2Chats({ messages, reserveTool: true });

    expect(result).toHaveLength(1);
    const toolValue = result[0].value[0] as any;
    expect(toolValue.tools).toBeDefined();
    expect(toolValue.tools).toHaveLength(1);
    expect(toolValue.tools[0].functionName).toBe('search_web');
    expect(toolValue.tools[0].response).toBe('{"results": []}');
  });

  it('should stringify non-string tool response content', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_1',
        content: [{ type: 'text', text: 'chunked result' }]
      }
    ];

    const result = GPTMessages2Chats({ messages, reserveTool: true });

    expect(result).toHaveLength(1);
    expect((result[0].value[0] as any).tools[0].response).toBe(
      '[{"type":"text","text":"chunked result"}]'
    );
  });

  it('should keep assistant content and reasoning separate from tools after chat roundtrip', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Checking both tools.',
        reasoning_content: 'Need weather and time.',
        tool_calls: [
          {
            id: 'call_weather',
            type: 'function',
            function: {
              name: 'weather',
              arguments: '{"city":"Beijing"}'
            }
          },
          {
            id: 'call_time',
            type: 'function',
            function: {
              name: 'time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_weather',
        content: 'compressed weather'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_time',
        content: 'compressed time'
      }
    ];

    const chats = GPTMessages2Chats({ messages, reserveTool: true, reserveReason: true });
    const restoredMessages = chats2GPTMessages({
      messages: chats,
      reserveId: false,
      reserveTool: true
    });

    expect(chats).toHaveLength(1);
    expect(chats[0].value).toEqual([
      {
        reasoning: {
          content: 'Need weather and time.'
        },
        text: {
          content: 'Checking both tools.'
        }
      },
      {
        tools: [
          {
            id: 'call_weather',
            toolName: '',
            toolAvatar: '',
            functionName: 'weather',
            params: '{"city":"Beijing"}',
            response: 'compressed weather'
          },
          {
            id: 'call_time',
            toolName: '',
            toolAvatar: '',
            functionName: 'time',
            params: '{}',
            response: 'compressed time'
          }
        ]
      }
    ]);
    expect(restoredMessages).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Checking both tools.',
        reasoning_content: 'Need weather and time.',
        tool_calls: [
          {
            id: 'call_weather',
            type: 'function',
            function: {
              name: 'weather',
              arguments: '{"city":"Beijing"}'
            }
          },
          {
            id: 'call_time',
            type: 'function',
            function: {
              name: 'time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_weather',
        content: 'compressed weather'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_time',
        content: 'compressed time'
      }
    ]);
  });

  it('should preserve serial tool turns after chat roundtrip', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'First call.',
        reasoning_content: 'Think before first call.',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_1',
        content: 'time 1'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Second call.',
        reasoning_content: 'Think after first result.',
        tool_calls: [
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_2',
        content: 'time 2'
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Third call.',
        reasoning_content: 'Think after second result.',
        tool_calls: [
          {
            id: 'call_3',
            type: 'function',
            function: {
              name: 'time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_3',
        content: 'time 3'
      }
    ];

    const chats = GPTMessages2Chats({ messages, reserveTool: true, reserveReason: true });
    const restoredMessages = chats2GPTMessages({
      messages: chats,
      reserveId: false,
      reserveTool: true
    });

    expect(restoredMessages).toEqual([
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'First call.',
        reasoning_content: 'Think before first call.',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_1',
        content: 'time 1'
      },
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Second call.',
        reasoning_content: 'Think after first result.',
        tool_calls: [
          {
            id: 'call_2',
            type: 'function',
            function: {
              name: 'time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_2',
        content: 'time 2'
      },
      {
        dataId: undefined,
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Third call.',
        reasoning_content: 'Think after second result.',
        tool_calls: [
          {
            id: 'call_3',
            type: 'function',
            function: {
              name: 'time',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_3',
        content: 'time 3'
      }
    ]);
  });

  it('should skip tool_calls when reserveTool is false', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Response text',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'search_web',
              arguments: '{"query": "test"}'
            }
          }
        ]
      }
    ];

    const result = GPTMessages2Chats({ messages, reserveTool: false });

    expect(result).toHaveLength(1);
    const value = result[0].value[0] as any;
    expect(value.tools).toBeUndefined();
    expect(value.text?.content).toBe('Response text');
  });

  it('should keep deprecated function_call as single tool when reserveTool is true', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: '',
        function_call: {
          id: 'call_1',
          name: 'search_web',
          arguments: '{"query": "test"}',
          toolName: 'Search',
          toolAvatar: '/avatar.png'
        } as any
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Function,
        name: 'search_web',
        content: '{"results": []}'
      }
    ];

    const result = GPTMessages2Chats({ messages, reserveTool: true });

    expect(result).toHaveLength(1);
    const value = result[0].value[0] as any;
    expect(value.tool).toMatchObject({
      id: 'call_1',
      toolName: 'Search',
      toolAvatar: '/avatar.png',
      functionName: 'search_web',
      params: '{"query": "test"}',
      response: '{"results": []}'
    });
  });

  it('should handle interactive in assistant message', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: '',
        interactive: {
          type: 'agentPlanAskQuery',
          params: {
            content: 'What would you like to know?'
          }
        } as any
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    const interactiveValue = result[0].value[0] as any;
    expect(interactiveValue.interactive).toBeDefined();
    expect(interactiveValue.interactive?.type).toBe('agentPlanAskQuery');
  });

  it('should preserve hideInUI property', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'Hidden message',
        hideInUI: true
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect((result[0] as any).hideInUI).toBe(true);
  });

  it('should keep assistant reasoning separate when dataId prevents attaching to visible content', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        dataId: 'reasoning-message',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Reasoning from another assistant item'
      },
      {
        dataId: 'answer-message',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Visible answer'
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(2);
    expect(result[0].dataId).toBe('reasoning-message');
    expect(result[0].value).toEqual([
      {
        reasoning: {
          content: 'Reasoning from another assistant item'
        }
      }
    ]);
    expect(result[1].dataId).toBe('answer-message');
    expect(result[1].value).toEqual([
      {
        text: {
          content: 'Visible answer'
        }
      }
    ]);
  });

  it('should keep assistant reasoning separate when hideInUI prevents attaching to visible content', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        dataId: 'assistant-data-id',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        reasoning_content: 'Hidden reasoning',
        hideInUI: true
      },
      {
        dataId: 'assistant-data-id',
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Visible answer'
      }
    ];

    const result = GPTMessages2Chats({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].hideInUI).toBeUndefined();
    expect(result[0].value).toEqual([
      {
        hideInUI: true,
        reasoning: {
          content: 'Hidden reasoning'
        }
      },
      {
        text: {
          content: 'Visible answer'
        }
      }
    ]);
  });

  it('should use getToolInfo callback when provided', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'custom_tool',
              arguments: '{}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_1',
        content: 'result'
      }
    ];

    const getToolInfo = (_name: string) => ({
      name: 'Custom Tool Display Name',
      avatar: 'http://example.com/avatar.png'
    });

    const result = GPTMessages2Chats({ messages, reserveTool: true, getToolInfo });

    const toolValue = result[0].value[0] as any;
    expect(toolValue.tools).toBeDefined();
    expect(toolValue.tools).toHaveLength(1);
    expect(toolValue.tools[0].toolName).toBe('Custom Tool Display Name');
    expect(toolValue.tools[0].toolAvatar).toBe('http://example.com/avatar.png');
  });
});

describe('chatValue2RuntimePrompt', () => {
  it('should extract text from value items', () => {
    const value = [{ text: { content: 'Hello' } }, { text: { content: ' World' } }];

    const result = chatValue2RuntimePrompt(value);

    expect(result.text).toBe('Hello World');
    expect(result.files).toHaveLength(0);
  });

  it('should extract files from value items', () => {
    const value = [
      {
        file: {
          type: ChatFileTypeEnum.image,
          name: 'test.png',
          url: 'http://example.com/test.png'
        }
      }
    ];

    const result = chatValue2RuntimePrompt(value);

    expect(result.files).toHaveLength(1);
    expect(result.files[0].type).toBe(ChatFileTypeEnum.image);
    expect(result.text).toBe('');
  });

  it('should handle mixed text and files', () => {
    const value = [
      { text: { content: 'Check this image:' } },
      {
        file: {
          type: ChatFileTypeEnum.image,
          name: 'test.png',
          url: 'http://example.com/test.png'
        }
      }
    ];

    const result = chatValue2RuntimePrompt(value);

    expect(result.text).toBe('Check this image:');
    expect(result.files).toHaveLength(1);
  });
});

describe('runtimePrompt2ChatsValue', () => {
  it('should convert text to chat value', () => {
    const prompt = { text: 'Hello World' };

    const result = runtimePrompt2ChatsValue(prompt);

    expect(result).toHaveLength(1);
    expect(result[0].text?.content).toBe('Hello World');
  });

  it('should convert files to chat value', () => {
    const prompt = {
      files: [
        {
          type: ChatFileTypeEnum.image,
          name: 'test.png',
          url: 'http://example.com/test.png'
        }
      ]
    };

    const result = runtimePrompt2ChatsValue(prompt);

    expect(result).toHaveLength(1);
    expect(result[0].file?.type).toBe(ChatFileTypeEnum.image);
  });

  it('should handle both text and files', () => {
    const prompt = {
      text: 'Check this:',
      files: [
        {
          type: ChatFileTypeEnum.image,
          name: 'test.png',
          url: 'http://example.com/test.png'
        }
      ]
    };

    const result = runtimePrompt2ChatsValue(prompt);

    expect(result).toHaveLength(2);
    expect(result[0].file).toBeDefined();
    expect(result[1].text?.content).toBe('Check this:');
  });

  it('should return empty array for empty prompt', () => {
    const result = runtimePrompt2ChatsValue({});

    expect(result).toHaveLength(0);
  });
});

describe('getSystemPrompt_ChatItemType', () => {
  it('should return empty array for undefined prompt', () => {
    const result = getSystemPrompt_ChatItemType(undefined);

    expect(result).toHaveLength(0);
  });

  it('should return empty array for empty string prompt', () => {
    const result = getSystemPrompt_ChatItemType('');

    expect(result).toHaveLength(0);
  });

  it('should return system chat item for valid prompt', () => {
    const result = getSystemPrompt_ChatItemType('You are a helpful assistant');

    expect(result).toHaveLength(1);
    expect(result[0].obj).toBe(ChatRoleEnum.System);
    expect(result[0].value[0].text?.content).toBe('You are a helpful assistant');
  });
});
