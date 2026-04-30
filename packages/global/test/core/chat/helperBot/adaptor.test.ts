import { describe, expect, it } from 'vitest';
import { helperChats2GPTMessages } from '@fastgpt/global/core/chat/helperBot/adaptor';
import { ChatRoleEnum, ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { HelperBotChatItemType } from '@fastgpt/global/core/chat/helperBot/type';

describe('helperChats2GPTMessages', () => {
  it('should convert system message', () => {
    const messages = [
      {
        obj: ChatRoleEnum.System,
        value: [{ text: { content: 'You are a helpful assistant' } }]
      }
    ] as HelperBotChatItemType[];

    const result = helperChats2GPTMessages({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.System);
    expect(result[0].content).toBe('You are a helpful assistant');
  });

  it('should skip system message with empty content', () => {
    const messages = [
      {
        obj: ChatRoleEnum.System,
        value: [{ text: { content: '' } }]
      }
    ] as HelperBotChatItemType[];

    const result = helperChats2GPTMessages({ messages });

    expect(result).toHaveLength(0);
  });

  it('should convert human message with text', () => {
    const messages = [
      {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'Hello' } }]
      }
    ] as HelperBotChatItemType[];

    const result = helperChats2GPTMessages({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.User);
    expect(result[0].content).toBe('Hello');
  });

  it('should convert human message with image', () => {
    const messages = [
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
    ] as HelperBotChatItemType[];

    const result = helperChats2GPTMessages({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.User);
    expect(Array.isArray(result[0].content)).toBe(true);
    const content = result[0].content as any[];
    expect(content[0].type).toBe('image_url');
    expect(content[0].image_url.url).toBe('http://example.com/test.png');
  });

  it('should convert human message with file', () => {
    const messages = [
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
    ] as HelperBotChatItemType[];

    const result = helperChats2GPTMessages({ messages });

    expect(result).toHaveLength(1);
    const content = result[0].content as any[];
    expect(content[0].type).toBe('file_url');
    expect(content[0].name).toBe('document.pdf');
  });

  it('should convert AI message with text', () => {
    const messages = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Hello, how can I help?' } }]
      }
    ] as HelperBotChatItemType[];

    const result = helperChats2GPTMessages({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
    expect(result[0].content).toBe('Hello, how can I help?');
  });

  it('should concat multiple AI text values', () => {
    const messages = [
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'Part 1' } }, { text: { content: ' Part 2' } }]
      }
    ] as HelperBotChatItemType[];

    const result = helperChats2GPTMessages({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe('Part 1 Part 2');
  });

  it('should add empty assistant message when AI has no content', () => {
    const messages = [
      {
        obj: ChatRoleEnum.AI,
        value: []
      }
    ] as unknown as HelperBotChatItemType[];

    const result = helperChats2GPTMessages({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
    expect(result[0].content).toBe('');
  });

  it('should handle mixed message types', () => {
    const messages = [
      {
        obj: ChatRoleEnum.System,
        value: [{ text: { content: 'System prompt' } }]
      },
      {
        obj: ChatRoleEnum.Human,
        value: [{ text: { content: 'User question' } }]
      },
      {
        obj: ChatRoleEnum.AI,
        value: [{ text: { content: 'AI response' } }]
      }
    ] as HelperBotChatItemType[];

    const result = helperChats2GPTMessages({ messages });

    expect(result).toHaveLength(3);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.System);
    expect(result[1].role).toBe(ChatCompletionRequestMessageRoleEnum.User);
    expect(result[2].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
  });

  it('should handle collectionForm in AI message', () => {
    const messages = [
      {
        obj: ChatRoleEnum.AI,
        value: [
          {
            collectionForm: {
              type: 'userInput',
              params: {
                description: 'Please fill the form',
                inputForm: [
                  { label: 'Name', type: 'input', key: 'name', required: true, value: '' }
                ]
              }
            }
          }
        ]
      }
    ] as HelperBotChatItemType[];

    const result = helperChats2GPTMessages({ messages });

    expect(result).toHaveLength(1);
    expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
    expect(typeof result[0].content).toBe('string');
    expect(result[0].content).toContain('Name');
  });
});
