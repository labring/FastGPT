import { describe, expect, it } from 'vitest';
import {
  GPT2Chat,
  adaptRole_Message2Chat,
  simpleUserContentPart,
  chats2GPTMessages,
  GPTMessages2Chats,
  chatValue2RuntimePrompt,
  runtimePrompt2ChatsValue,
  getSystemPrompt_ChatItemType
} from '@fastgpt/global/core/chat/adapt';
import { ChatRoleEnum, ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/type';

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

describe('chats2GPTMessages', () => {
  it('should convert system message', () => {
    const messages: ChatItemType[] = [
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
    const messages: ChatItemType[] = [
      {
        obj: ChatRoleEnum.System,
        value: [{ text: { content: '' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(0);
  });

  it('should convert human message with text', () => {
    const messages: ChatItemType[] = [
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

  it('should convert human message with image', () => {
    const messages: ChatItemType[] = [
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
    const messages: ChatItemType[] = [
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
    const messages: ChatItemType[] = [
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
    const messages: ChatItemType[] = [
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
    const messages: ChatItemType[] = [
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
    const messages: ChatItemType[] = [
      {
        dataId: 'test-data-id',
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'Hello' } }]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result[0].dataId).toBeUndefined();
  });

  it('should handle AI message with tool calls when reserveTool is true', () => {
    const messages: ChatItemType[] = [
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
    expect((result[0] as any).tool_calls).toBeDefined();
    expect(result[1].role).toBe(ChatCompletionRequestMessageRoleEnum.Tool);
  });

  it('should skip empty AI text values when there are multiple values', () => {
    const messages: ChatItemType[] = [
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
    const messages: ChatItemType[] = [
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
    const messages: ChatItemType[] = [
      {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'Hidden message' } }],
        hideInUI: true
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect((result[0] as any).hideInUI).toBe(true);
  });

  it('should handle interactive agentPlanAskQuery', () => {
    const messages: ChatItemType[] = [
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

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('What would you like to know?');
  });

  it('should handle interactive agentPlanAskUserForm', () => {
    const messages: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            interactive: {
              type: 'agentPlanAskUserForm',
              params: {
                description: 'Please fill in the form',
                inputForm: [
                  { label: 'Name', value: 'John' },
                  { label: 'Age', value: '25' }
                ]
              }
            }
          } as any
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false });

    expect(result).toHaveLength(1);
    expect(result[0].content).toContain('Please fill in the form');
    expect(result[0].content).toContain('- Name: John');
    expect(result[0].content).toContain('- Age: 25');
  });

  it('should handle plan with reserveTool true', () => {
    const messages: ChatItemType[] = [
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
            stepId: 'step-1',
            text: { content: 'Search results here' }
          } as any,
          {
            stepId: 'step-2',
            text: { content: 'Analysis complete' }
          } as any
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: true });

    expect(result).toHaveLength(2);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
    expect((result[0] as any).tool_calls).toBeDefined();
    expect((result[0] as any).tool_calls[0].function.name).toBe('plan_agent');
    expect(result[1].role).toBe(ChatCompletionRequestMessageRoleEnum.Tool);
  });

  it('should skip duplicate plan with same planId', () => {
    const messages: ChatItemType[] = [
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
              planId: 'plan-1',
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

    // Should only have 2 messages (1 assistant + 1 tool) for the first plan
    expect(result).toHaveLength(2);
  });

  it('should not process plan when reserveTool is false', () => {
    const messages: ChatItemType[] = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            plan: {
              planId: 'plan-1',
              task: 'Search for information',
              description: 'Search the web',
              background: 'User needs info',
              steps: []
            }
          } as any
        ]
      }
    ];

    const result = chats2GPTMessages({ messages, reserveId: false, reserveTool: false });

    // Plan should be skipped when reserveTool is false
    expect(result).toHaveLength(0);
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
    const reasoningValue = result[0].value[0] as { reasoning?: { content: string } };
    expect(reasoningValue.reasoning?.content).toBe('Let me think about this...');
    expect(result[0].value[1].text?.content).toBe('Final answer');
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
    expect(result[0].value).toHaveLength(2);
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
    expect(value.tool).toBeUndefined();
    expect(value.text?.content).toBe('Response text');
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

  it('should handle function_call in assistant message with reserveTool true', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: '',
        function_call: {
          name: 'get_weather',
          arguments: '{"location": "Beijing"}'
        }
      } as any,
      {
        role: ChatCompletionRequestMessageRoleEnum.Function,
        name: 'get_weather',
        content: '{"temperature": 25}'
      }
    ];

    // Add extended properties after creation
    (messages[0] as any).function_call.id = 'func_1';
    (messages[0] as any).function_call.toolName = 'Weather Tool';
    (messages[0] as any).function_call.toolAvatar = 'http://example.com/weather.png';

    const result = GPTMessages2Chats({ messages, reserveTool: true });

    expect(result).toHaveLength(1);
    const toolValue = result[0].value[0] as any;
    expect(toolValue.tool).toBeDefined();
    expect(toolValue.tool?.functionName).toBe('get_weather');
    expect(toolValue.tool?.params).toBe('{"location": "Beijing"}');
    expect(toolValue.tool?.response).toBe('{"temperature": 25}');
    expect(toolValue.tool?.toolName).toBe('Weather Tool');
    expect(toolValue.tool?.toolAvatar).toBe('http://example.com/weather.png');
  });

  it('should skip function_call when reserveTool is false', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Response text',
        function_call: {
          name: 'get_weather',
          arguments: '{"location": "Beijing"}'
        }
      } as any,
      {
        role: ChatCompletionRequestMessageRoleEnum.Function,
        name: 'get_weather',
        content: '{"temperature": 25}'
      }
    ];

    const result = GPTMessages2Chats({ messages, reserveTool: false });

    expect(result).toHaveLength(1);
    const value = result[0].value[0] as any;
    expect(value.tool).toBeUndefined();
    expect(value.text?.content).toBe('Response text');
  });

  it('should skip function_call when no matching function response', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: 'Response text',
        function_call: {
          name: 'get_weather',
          arguments: '{"location": "Beijing"}'
        }
      } as any
      // No function response message
    ];

    const result = GPTMessages2Chats({ messages, reserveTool: true });

    expect(result).toHaveLength(1);
    // Should only have text content since no function response was found
    const value = result[0].value[0] as any;
    expect(value.text?.content).toBe('Response text');
  });

  it('should skip plan_agent tool in tool_calls', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: '',
        tool_calls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'plan_agent',
              arguments: '{"task": "test"}'
            }
          }
        ]
      },
      {
        role: ChatCompletionRequestMessageRoleEnum.Tool,
        tool_call_id: 'call_1',
        content: '[]'
      }
    ];

    const result = GPTMessages2Chats({ messages, reserveTool: true });

    // plan_agent should be skipped, resulting in empty tools array
    expect(result).toHaveLength(1);
    const toolValue = result[0].value[0] as any;
    expect(toolValue.tools).toBeDefined();
    expect(toolValue.tools).toHaveLength(0);
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
