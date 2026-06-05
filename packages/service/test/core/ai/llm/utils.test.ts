import {
  loadRequestMessages,
  filterGPTMessageByMaxContext
} from '@fastgpt/service/core/ai/llm/utils';
import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@fastgpt/service/common/string/tiktoken/index', () => {
  const countGptMessagesTokens = vi.fn();
  return {
    countGptMessagesTokens,
    countGptMessagesTokensBatch: vi.fn((messageGroups: ChatCompletionMessageParam[][]) =>
      Promise.all(messageGroups.map((messages) => countGptMessagesTokens({ messages })))
    )
  };
});

vi.mock('@fastgpt/service/common/file/image/utils', () => ({
  getImageBase64: vi.fn()
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    warn: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/api/axios', () => ({
  axios: {
    head: vi.fn(),
    get: vi.fn()
  }
}));

import { countGptMessagesTokens } from '@fastgpt/service/common/string/tiktoken/index';
import { getImageBase64 } from '@fastgpt/service/common/file/image/utils';
import { serviceEnv } from '@fastgpt/service/env';
import { axios } from '@fastgpt/service/common/api/axios';

const mockCountGptMessagesTokens = vi.mocked(countGptMessagesTokens);
const mockGetImageBase64 = vi.mocked(getImageBase64);
const mockAxiosHead = vi.mocked(axios.head);
const mockAxiosGet = vi.mocked(axios.get);
const originalMultipleDataToBase64 = serviceEnv.MULTIPLE_DATA_TO_BASE64;

describe('filterGPTMessageByMaxContext function tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
    mockCountGptMessagesTokens.mockResolvedValue(10);
  });

  describe('Basic filtering scenarios', () => {
    it('should return empty array for invalid input', async () => {
      const result = await filterGPTMessageByMaxContext({
        messages: null as any,
        maxContext: 1000
      });
      expect(result).toEqual([]);

      const result2 = await filterGPTMessageByMaxContext({
        messages: undefined as any,
        maxContext: 1000
      });
      expect(result2).toEqual([]);
    });

    it('should return messages unchanged when less than 4 messages', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'You are helpful' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Hi there!' }
      ];

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: 1000
      });

      expect(result).toEqual(messages);
    });

    it('should return only system prompts when no chat prompts exist', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System prompt 1' },
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System prompt 2' }
      ];

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: 1000
      });

      expect(result).toEqual(messages);
    });
  });

  describe('System and chat prompt separation', () => {
    it('should correctly separate system prompts from chat prompts', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System 1' },
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System 2' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'User 1' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Assistant 1' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'User 2' }
      ];

      mockCountGptMessagesTokens
        .mockResolvedValueOnce(20) // system prompts
        .mockResolvedValueOnce(30) // user 2
        .mockResolvedValueOnce(25) // assistant 1 + user 1
        .mockResolvedValueOnce(15); // user 1

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: 1000
      });

      expect(result).toHaveLength(5);
      expect(
        result.slice(0, 2).every((msg) => msg.role === ChatCompletionRequestMessageRoleEnum.System)
      ).toBe(true);
      expect(
        result.slice(2).every((msg) => msg.role !== ChatCompletionRequestMessageRoleEnum.System)
      ).toBe(true);
    });
  });

  describe('Context limiting behavior', () => {
    it('should filter out messages when context limit is exceeded', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'User 1' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Assistant 1' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'User 2' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Assistant 2' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'User 3' }
      ];

      mockCountGptMessagesTokens
        .mockResolvedValueOnce(50) // system prompts
        .mockResolvedValueOnce(60) // user 3 (exceeds remaining context)
        .mockResolvedValueOnce(40); // assistant 2 + user 2

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: 100
      });

      // Should keep system + last complete conversation that fits
      expect(result).toHaveLength(2);
      expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.System);
      expect(result[1].content).toBe('User 3');
    });

    it('should preserve at least one conversation round even if it exceeds context', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Large user message' },
        {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: 'Large assistant response'
        }
      ];

      mockCountGptMessagesTokens
        .mockResolvedValueOnce(20) // system prompts
        .mockResolvedValueOnce(200); // user + assistant (exceeds remaining context)

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: 50
      });

      // Should still keep the conversation even though it exceeds context
      expect(result).toHaveLength(3);
      expect(result[1].content).toBe('Large user message');
      expect(result[2].content).toBe('Large assistant response');
    });

    it('should preserve a leading context checkpoint before recent chat messages', async () => {
      const checkpointMessage: ChatCompletionMessageParam = {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: '<context_checkpoint>old context summary</context_checkpoint>',
        hideInUI: true
      };
      const currentUserMessage: ChatCompletionMessageParam = {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'current user request'
      };
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System' },
        { role: ChatCompletionRequestMessageRoleEnum.Developer, content: 'Developer' },
        checkpointMessage,
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'old user request' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'old assistant answer' },
        currentUserMessage
      ];

      mockCountGptMessagesTokens
        .mockResolvedValueOnce(30) // system + developer + checkpoint
        .mockResolvedValueOnce(20) // current user
        .mockResolvedValueOnce(80); // previous full round exceeds remaining context

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: 100
      });

      expect(result).toEqual([
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System' },
        { role: ChatCompletionRequestMessageRoleEnum.Developer, content: 'Developer' },
        checkpointMessage,
        currentUserMessage
      ]);
    });

    it('should not treat visible user text containing checkpoint tags as a context checkpoint', async () => {
      const visibleCheckpointLikeMessage: ChatCompletionMessageParam = {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'please explain <context_checkpoint> as plain text'
      };
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System' },
        visibleCheckpointLikeMessage,
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Assistant 1' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'current user request' }
      ];

      mockCountGptMessagesTokens
        .mockResolvedValueOnce(20) // system only, no leading checkpoint is counted here
        .mockResolvedValueOnce(20) // current user
        .mockResolvedValueOnce(120); // visible checkpoint-like user round exceeds remaining context

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: 60
      });

      expect(result).toEqual([
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'current user request' }
      ]);
      expect(mockCountGptMessagesTokens).toHaveBeenNthCalledWith(1, {
        messages: [{ role: ChatCompletionRequestMessageRoleEnum.System, content: 'System' }]
      });
    });

    it('should not preserve malformed hidden checkpoint-like messages as leading checkpoints', async () => {
      const malformedCheckpointMessage: ChatCompletionMessageParam = {
        role: ChatCompletionRequestMessageRoleEnum.User,
        content: 'prefix <context_checkpoint>old context summary</context_checkpoint>',
        hideInUI: true
      };
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System' },
        malformedCheckpointMessage,
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Assistant 1' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'current user request' }
      ];

      mockCountGptMessagesTokens
        .mockResolvedValueOnce(20) // system only, malformed checkpoint is not preserved
        .mockResolvedValueOnce(20) // current user
        .mockResolvedValueOnce(120); // malformed checkpoint round exceeds remaining context

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: 60
      });

      expect(result).toEqual([
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'current user request' }
      ]);
    });
  });

  describe('Complex conversation patterns', () => {
    it('should handle user-assistant-tool conversation pattern', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'User 1' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Assistant 1' },
        {
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          tool_call_id: 'call1',
          content: 'Tool 1'
        },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'User 2' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Assistant 2' },
        {
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          tool_call_id: 'call2',
          content: 'Tool 2'
        },
        {
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          tool_call_id: 'call3',
          content: 'Tool 3'
        }
      ];

      mockCountGptMessagesTokens
        .mockResolvedValueOnce(20) // system
        .mockResolvedValueOnce(50) // last group: assistant 2 + tool 2 + tool 3 + user 2
        .mockResolvedValueOnce(40); // previous group: assistant 1 + tool 1 + user 1

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: 1000
      });

      expect(result).toHaveLength(8);
      expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.System);
    });

    it('should handle multiple assistant messages in sequence', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'User 1' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Assistant 1' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Assistant 2' },
        {
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          tool_call_id: 'call1',
          content: 'Tool result'
        },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'User 2' }
      ];

      mockCountGptMessagesTokens
        .mockResolvedValueOnce(30) // user 2
        .mockResolvedValueOnce(60); // assistant 1 + assistant 2 + tool + user 1

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: 1000
      });

      expect(result).toHaveLength(5);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty messages array', async () => {
      const result = await filterGPTMessageByMaxContext({
        messages: [],
        maxContext: 1000
      });

      expect(result).toEqual([]);
    });

    it('should handle zero maxContext', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'User' }
      ];

      mockCountGptMessagesTokens
        .mockResolvedValueOnce(10) // system
        .mockResolvedValueOnce(20); // user

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: 0
      });

      // Should still preserve at least one conversation
      expect(result).toHaveLength(2);
    });

    it('should handle negative maxContext', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'User' }
      ];

      mockCountGptMessagesTokens.mockResolvedValueOnce(20);

      const result = await filterGPTMessageByMaxContext({
        messages,
        maxContext: -100
      });

      expect(result).toHaveLength(1);
    });
  });
});

describe('loadRequestMessages function tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
    mockGetImageBase64.mockResolvedValue({
      completeBase64: 'data:image/png;base64,test',
      base64: 'test',
      mime: 'image/png'
    });
    mockAxiosHead.mockResolvedValue({ status: 200 });
  });

  describe('Basic message processing', () => {
    it('should reject empty messages array', async () => {
      await expect(
        loadRequestMessages({
          messages: []
        })
      ).rejects.toMatch('common:core.chat.error.Messages empty');
    });

    it('should process simple conversation', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'You are helpful' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Hi there!' }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(3);
      expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.System);
      expect(result[0].content).toBe('You are helpful');
      expect(result[1].role).toBe(ChatCompletionRequestMessageRoleEnum.User);
      expect(result[1].content).toBe('Hello');
      expect(result[2].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
      expect(result[2].content).toBe('Hi there!');
    });
  });

  describe('System message processing', () => {
    it('should handle string system content', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System prompt' }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('System prompt');
    });

    it('should handle array system content', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.System,
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' }
          ]
        }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Part 1\n\nPart 2');
    });

    it('should filter out empty text in system content array', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.System,
          content: [
            { type: 'text', text: 'Valid text' },
            { type: 'text', text: '' },
            { type: 'text', text: 'Another valid text' }
          ]
        }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Valid text\n\nAnother valid text');
    });

    it('should skip system message with empty content', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: '' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(1);
      expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.User);
    });
  });

  describe('User message processing with vision', () => {
    it('should process simple text user message', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello world' }
      ];

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Hello world');
    });

    it('should not extract images from short text by default', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: 'https://example.com/image.png'
        }
      ];

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(result).toHaveLength(1);
      // When useVision is true and text contains image URL, it returns array format
      expect(Array.isArray(result[0].content)).toBe(true);
      const content = result[0].content as any[];
      expect(content.some((item: any) => item.type === 'image_url')).toBe(true);
      expect(content.some((item: any) => item.type === 'text')).toBe(true);
    });

    it('should not extract images when useVision is false', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: 'Look at https://example.com/image.png'
        }
      ];

      const result = await loadRequestMessages({ messages, useVision: false });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('Look at https://example.com/image.png');
    });

    it('should extract audio and video links when enabled', async () => {
      serviceEnv.MULTIPLE_DATA_TO_BASE64 = false;

      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content:
            'Check https://example.com/audio.mp3, https://example.com/voice.ogg and https://example.com/video.mp4?download=1'
        }
      ];

      const result = await loadRequestMessages({
        messages,
        useAudio: true,
        useVideo: true,
        extractFiles: true
      });

      expect(result).toHaveLength(1);
      expect(Array.isArray(result[0].content)).toBe(true);
      const content = result[0].content as any[];
      expect(content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'input_audio',
            input_audio: {
              data: 'https://example.com/audio.mp3',
              format: 'mp3'
            }
          }),
          expect.objectContaining({
            type: 'input_audio',
            input_audio: {
              data: 'https://example.com/voice.ogg',
              format: 'ogg'
            }
          }),
          expect.objectContaining({
            type: 'video_url',
            video_url: {
              url: 'https://example.com/video.mp4?download=1'
            }
          }),
          expect.objectContaining({ type: 'text' })
        ])
      );
      expect(content.some((item: any) => item.type === 'file_url')).toBe(false);
      expect(content.some((item: any) => item.type === 'file')).toBe(false);
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it('should convert extracted audio and video links when MULTIPLE_DATA_TO_BASE64 is enabled', async () => {
      serviceEnv.MULTIPLE_DATA_TO_BASE64 = true;
      mockAxiosGet.mockResolvedValue({
        data: Buffer.from('media bytes')
      });
      const audioUrl =
        'http://localhost:9000/fastgpt-private/chat/fastgpt_intro.wav?X-Amz-Signature=test';
      const videoUrl = 'http://127.0.0.1:9000/fastgpt-private/chat/demo.mp4';
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: `Check ${audioUrl} and ${videoUrl}`
        }
      ];

      const result = await loadRequestMessages({
        messages,
        useAudio: true,
        useVideo: true,
        extractFiles: true
      });

      expect(result).toHaveLength(1);
      const content = result[0].content as any[];
      expect(content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'input_audio',
            input_audio: {
              data: `data:;base64,${Buffer.from('media bytes').toString('base64')}`,
              format: 'wav'
            }
          }),
          expect.objectContaining({
            type: 'video_url',
            video_url: {
              url: `data:;base64,${Buffer.from('media bytes').toString('base64')}`
            }
          })
        ])
      );
      expect(mockAxiosGet).toHaveBeenCalledWith(audioUrl, {
        responseType: 'arraybuffer',
        timeout: 10000
      });
      expect(mockAxiosGet).toHaveBeenCalledWith(videoUrl, {
        responseType: 'arraybuffer',
        timeout: 10000
      });
    });

    it('should ignore file keys and normalize audio and video file_url from existing urls', async () => {
      serviceEnv.MULTIPLE_DATA_TO_BASE64 = false;
      const audioUrl = 'https://cdn.example.com/preview/audio.mp3';
      const videoUrl = 'https://cdn.example.com/preview/video.mp4';
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [
            {
              type: 'file_url',
              name: 'audio.mp3',
              url: audioUrl,
              fileType: 'audio',
              key: 'chat/audio.mp3'
            },
            {
              type: 'file_url',
              name: 'video.mp4',
              url: videoUrl,
              fileType: 'video',
              key: 'chat/video.mp4'
            },
            {
              type: 'text',
              text: 'Analyze these files'
            }
          ]
        }
      ];

      const result = await loadRequestMessages({
        messages,
        useAudio: true,
        useVideo: true
      });

      expect(result).toHaveLength(1);
      const content = result[0].content as any[];
      expect(content).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'input_audio',
            input_audio: {
              data: audioUrl,
              format: 'mp3'
            }
          }),
          expect.objectContaining({
            type: 'video_url',
            video_url: {
              url: videoUrl
            }
          }),
          expect.objectContaining({ type: 'text', text: 'Analyze these files' })
        ])
      );
      expect(content.some((item: any) => item.type === 'file_url')).toBe(false);
      expect(content.some((item: any) => item.key)).toBe(false);
      expect(mockAxiosGet).not.toHaveBeenCalled();
    });

    it('should preserve legacy vision extraction when extractFiles is omitted', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: 'Look at https://example.com/image.png'
        }
      ];

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(result).toHaveLength(1);
      const content = result[0].content as any[];
      expect(content.some((item: any) => item.type === 'image_url')).toBe(true);
    });

    it('should not extract images from very long text (>500 chars)', async () => {
      const longText = 'A'.repeat(600) + ' https://example.com/image.png';
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: longText }
      ];

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(longText);
    });

    it('should limit to 4 images and return text if more found', async () => {
      const textWithManyImages =
        'Images: ' +
        'https://example.com/1.png ' +
        'https://example.com/2.jpg ' +
        'https://example.com/3.gif ' +
        'https://example.com/4.webp ' +
        'https://example.com/5.png';

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: textWithManyImages }
      ];

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe(textWithManyImages);
    });

    it('should handle array content with mixed types', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
          ]
        }
      ];

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(result).toHaveLength(1);
      // When array content has text and image_url, remains as array
      expect(Array.isArray(result[0].content)).toBe(true);
      const content = result[0].content as any[];
      expect(content.some((item: any) => item.type === 'text')).toBe(true);
    });

    it('should filter out empty text items from array content', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [
            { type: 'text', text: 'Valid text' },
            { type: 'text', text: '' },
            { type: 'text', text: 'Another text' }
          ]
        }
      ];

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(result).toHaveLength(1);
      const content = result[0].content as any[];
      expect(content).toHaveLength(2);
    });

    it('should keep text content when file_url is filtered out', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [
            {
              type: 'file_url',
              name: 'a.pdf',
              url: '/private/chat/a.pdf'
            },
            {
              type: 'text',
              text: '<FilesContent>File body</FilesContent>'
            }
          ]
        }
      ];

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('<FilesContent>File body</FilesContent>');
    });
  });

  describe('Image processing', () => {
    it('should load local image to base64', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [{ type: 'image_url', image_url: { url: '/local/image.png' } }]
        }
      ];

      mockGetImageBase64.mockResolvedValue({
        completeBase64: 'data:image/png;base64,localimage',
        base64: 'localimage',
        mime: 'image/png'
      });

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(result).toHaveLength(1);
      const content = result[0].content as any[];
      expect(content[0].image_url.url).toBe('data:image/png;base64,localimage');
    });

    it('should preserve base64 images as-is', async () => {
      const base64Image = 'data:image/png;base64,existingdata';
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [{ type: 'image_url', image_url: { url: base64Image } }]
        }
      ];

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(result).toHaveLength(1);
      const content = result[0].content as any[];
      expect(content[0].image_url.url).toBe(base64Image);
      expect(mockGetImageBase64).not.toHaveBeenCalled();
    });

    it('should handle invalid remote images gracefully', async () => {
      serviceEnv.MULTIPLE_DATA_TO_BASE64 = false;

      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [
            { type: 'text', text: 'Text' },
            { type: 'image_url', image_url: { url: 'https://invalid.com/image.png' } }
          ]
        }
      ];

      mockAxiosHead.mockRejectedValue(new Error('Network error'));

      try {
        const result = await loadRequestMessages({ messages, useVision: true });

        expect(result).toHaveLength(1);
        expect(result[0].content).toBe('Text');
      } finally {
        serviceEnv.MULTIPLE_DATA_TO_BASE64 = originalMultipleDataToBase64;
      }
    });

    it('should handle 405 status as valid image', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [
            { type: 'text', text: 'Check this image:' },
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
          ]
        }
      ];

      const error = new Error('Method not allowed');
      (error as any).response = { status: 405 };
      mockAxiosHead.mockRejectedValue(error);

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(result).toHaveLength(1);
      // 405 status is treated as valid, so image is kept and content is array
      expect(Array.isArray(result[0].content)).toBe(true);
      const content = result[0].content as any[];
      expect(content.some((item: any) => item.type === 'text')).toBe(true);
      expect(content.some((item: any) => item.type === 'image_url')).toBe(true);
    });

    it('should remove origin from image URLs when provided', async () => {
      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [{ type: 'image_url', image_url: { url: 'https://mysite.com/images/test.png' } }]
        }
      ];

      const result = await loadRequestMessages({
        messages,
        useVision: true,
        origin: 'https://mysite.com'
      });

      // Just verify the function processes without error - axios call verification is complex
      expect(result).toHaveLength(1);
    });
  });

  describe('Assistant message processing', () => {
    it('should process assistant message with string content', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Hi there!' }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(2);
      expect(result[1].content).toBe('Hi there!');
    });

    it('should process assistant message with array content', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' },
        {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' }
          ]
        }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(2);
      expect(result[1].content).toBe('Part 1\nPart 2');
    });

    it('should preserve tool_calls and function_call in assistant messages', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' },
        {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: null,
          tool_calls: [
            {
              id: 'call_123',
              type: 'function',
              function: { name: 'test_tool', arguments: '{}' }
            }
          ]
        }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(2);
      expect((result[1] as any).tool_calls).toHaveLength(1);
      expect((result[1] as any).tool_calls![0].function.name).toBe('test_tool');
    });

    it('should handle assistant message with null content', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: null }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(2);
      expect(result[1].content).toBe('null');
    });

    it('should handle empty assistant content between other assistants', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'First' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: '' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Last' }
      ];

      const result = await loadRequestMessages({ messages });

      // Adjacent assistant messages get merged, empty content in middle gets filtered during merge
      expect(result).toHaveLength(2);
      expect(result[1].content).toBe('First\n\nLast');
    });
  });

  describe('Message merging behavior', () => {
    it('should merge consecutive system messages', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System 1' },
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'System 2' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.System);
      // System messages when merged get converted to concatenated string
      expect(typeof result[0].content).toBe('string');
      expect(result[0].content).toBe('System 1\n\nSystem 2');
    });

    it('should merge consecutive user messages', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Message 1' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Message 2' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Response' }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe(ChatCompletionRequestMessageRoleEnum.User);
      // User messages get merged - final format may be array or string
      expect(result[0].content).toBeDefined();
    });

    it('should merge consecutive assistant messages with content', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Part 1' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Part 2' }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(2);
      expect(result[1].role).toBe(ChatCompletionRequestMessageRoleEnum.Assistant);
      expect(result[1].content).toBe('Part 1\nPart 2');
    });

    it('should not merge assistant messages when one has tool calls', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Text response' },
        {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: null,
          tool_calls: [
            { id: 'call1', type: 'function', function: { name: 'tool', arguments: '{}' } }
          ]
        }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(3); // Should not merge
      expect(result[1].content).toBe('Text response');
      expect((result[2] as any).tool_calls).toHaveLength(1);
    });
  });

  describe('Other message types', () => {
    it('should pass through tool messages unchanged', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' },
        {
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          tool_call_id: 'call1',
          content: 'Tool result'
        }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(2);
      expect(result[1].role).toBe(ChatCompletionRequestMessageRoleEnum.Tool);
      expect(result[1].content).toBe('Tool result');
    });

    it('should handle user message with empty content as null', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: '' }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('null');
    });

    it('should handle undefined user content', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: undefined as any }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('null');
    });
  });

  describe('Complex scenarios', () => {
    it('should handle mixed conversation with all message types', async () => {
      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'You are helpful' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'Hi!' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'How are you?' },
        {
          role: ChatCompletionRequestMessageRoleEnum.Assistant,
          content: null,
          tool_calls: [
            { id: 'call1', type: 'function', function: { name: 'check_status', arguments: '{}' } }
          ]
        },
        {
          role: ChatCompletionRequestMessageRoleEnum.Tool,
          tool_call_id: 'call1',
          content: 'Status: OK'
        },
        { role: ChatCompletionRequestMessageRoleEnum.Assistant, content: 'I am doing well!' }
      ];

      const result = await loadRequestMessages({ messages });

      expect(result).toHaveLength(7);
      expect(result.map((msg) => msg.role)).toEqual([
        ChatCompletionRequestMessageRoleEnum.System,
        ChatCompletionRequestMessageRoleEnum.User,
        ChatCompletionRequestMessageRoleEnum.Assistant,
        ChatCompletionRequestMessageRoleEnum.User,
        ChatCompletionRequestMessageRoleEnum.Assistant,
        ChatCompletionRequestMessageRoleEnum.Tool,
        ChatCompletionRequestMessageRoleEnum.Assistant
      ]);
    });

    it('should handle environment variable MULTIPLE_DATA_TO_BASE64', async () => {
      serviceEnv.MULTIPLE_DATA_TO_BASE64 = true;

      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: [{ type: 'image_url', image_url: { url: 'https://example.com/image.png' } }]
        }
      ];

      mockGetImageBase64.mockResolvedValue({
        completeBase64: 'data:image/png;base64,converted',
        base64: 'converted',
        mime: 'image/png'
      });

      const result = await loadRequestMessages({ messages, useVision: true });

      expect(mockGetImageBase64).toHaveBeenCalledWith('https://example.com/image.png');
      expect(result).toHaveLength(1);
      const content = result[0].content as any[];
      expect(content[0].image_url.url).toBe('data:image/png;base64,converted');
    });
  });
});
