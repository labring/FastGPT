import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  StreamResponseType
} from '@fastgpt/global/core/ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

// Mock dependencies
vi.mock('@fastgpt/service/core/ai/config', () => ({
  getAIApi: vi.fn(),
  defaultUserOpenAIBaseUrl: 'https://api.openai.com/v1'
}));

vi.mock('@fastgpt/service/core/ai/model', () => ({
  getLLMModel: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/llm/utils', () => ({
  loadRequestMessages: vi.fn()
}));

vi.mock('@fastgpt/service/common/string/tiktoken/index', () => ({
  countGptMessagesTokens: vi.fn()
}));

vi.mock('@fastgpt/service/common/system/log', () => ({
  addLog: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

vi.mock('@fastgpt/service/core/ai/llm/promptCall', () => ({
  parsePromptToolCall: vi.fn((content: string) => ({
    answer: content,
    streamAnswer: '',
    toolCalls: undefined
  })),
  promptToolCallMessageRewrite: vi.fn((messages: any) => messages)
}));

vi.mock('@fastgpt/service/core/ai/record/controller', () => ({
  createLLMRequestId: vi.fn(() => 'test-request-id'),
  saveLLMRequestRecord: vi.fn()
}));

vi.mock('@fastgpt/global/core/ai/llm/utils', () => ({
  removeDatasetCiteText: vi.fn((text: string) => text),
  getLLMSupportParams: vi.fn(() => ({
    vision: false,
    temperature: true,
    reasoning: false,
    topP: true,
    stop: true,
    responseFormat: false,
    supportToolCall: true
  }))
}));

vi.mock('@fastgpt/service/core/ai/utils', () => ({
  computedMaxToken: vi.fn(({ maxToken }: { maxToken?: number }) => maxToken || 4096),
  computedTemperature: vi.fn(({ temperature }: { temperature: number }) => temperature),
  parseLLMStreamResponse: vi.fn(),
  parseReasoningContent: vi.fn((content: string) => ['', content])
}));

// Import mocked modules
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { getLLMModel } from '@fastgpt/service/core/ai/model';
import { loadRequestMessages } from '@fastgpt/service/core/ai/llm/utils';
import { countGptMessagesTokens } from '@fastgpt/service/common/string/tiktoken/index';
import { parseLLMStreamResponse, parseReasoningContent } from '@fastgpt/service/core/ai/utils';
import { getLLMSupportParams } from '@fastgpt/global/core/ai/llm/utils';
import { promptToolCallMessageRewrite } from '@fastgpt/service/core/ai/llm/promptCall';
import { saveLLMRequestRecord } from '@fastgpt/service/core/ai/record/controller';

import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request/createLLMResponse';

const mockGetAIApi = vi.mocked(getAIApi);
const mockGetLLMModel = vi.mocked(getLLMModel);
const mockLoadRequestMessages = vi.mocked(loadRequestMessages);
const mockCountGptMessagesTokens = vi.mocked(countGptMessagesTokens);
const mockParseLLMStreamResponse = vi.mocked(parseLLMStreamResponse);
const mockParseReasoningContent = vi.mocked(parseReasoningContent);
const mockGetLLMSupportParams = vi.mocked(getLLMSupportParams);
const mockPromptToolCallMessageRewrite = vi.mocked(promptToolCallMessageRewrite);
const mockSaveLLMRequestRecord = vi.mocked(saveLLMRequestRecord);

const createMockAIApiResult = (
  ai: any,
  requestMeta = {
    usedUserOpenAIKey: false,
    baseUrl: 'https://system.example.com/v1'
  }
) =>
  ({
    ai,
    requestMeta
  }) as any;

const defaultSupportParams = {
  vision: false,
  temperature: true,
  reasoning: false,
  reasoningEffort: false,
  topP: true,
  stop: true,
  responseFormat: false,
  supportToolCall: true
};

// Helper to create mock model data
const createMockModelData = (overrides?: Partial<LLMModelItemType>): LLMModelItemType => ({
  type: ModelTypeEnum.llm,
  provider: 'openai',
  model: 'gpt-4',
  name: 'GPT-4',
  maxContext: 128000,
  maxResponse: 4096,
  quoteMaxToken: 60000,
  functionCall: true,
  toolChoice: true,
  reasoning: false,
  ...overrides
});

// Helper to create async generator for stream response
async function* createAsyncGenerator<T>(items: T[]): AsyncGenerator<T, void, unknown> {
  for (const item of items) {
    yield item;
  }
}

// Helper to create mock stream response
const createMockStreamResponse = (chunks: any[]): StreamResponseType => {
  const generator = createAsyncGenerator(chunks);
  return Object.assign(generator, {
    controller: { abort: vi.fn() }
  }) as unknown as StreamResponseType;
};

describe('createLLMResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock setup
    mockGetLLMModel.mockReturnValue(createMockModelData());
    mockLoadRequestMessages.mockImplementation(async ({ messages }: any) => messages as any);
    mockCountGptMessagesTokens.mockResolvedValue(100);
    mockParseReasoningContent.mockImplementation((content: string) => ['', content]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('User key routing', () => {
    const mockTextResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'ok'
          },
          finish_reason: 'stop'
        }
      ],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 1,
        total_tokens: 2
      }
    };

    it('should ignore user baseUrl when user key is missing', async () => {
      const modelData = createMockModelData({
        requestUrl: 'https://model.example.com/v1/chat/completions',
        requestAuth: 'model-key'
      });
      mockGetLLMModel.mockReturnValue(modelData);
      const createMock = vi.fn().mockResolvedValue(mockTextResponse);
      mockGetAIApi.mockReturnValue(
        createMockAIApiResult(
          {
            chat: {
              completions: {
                create: createMock
              }
            }
          },
          {
            usedUserOpenAIKey: false,
            baseUrl: 'https://model.example.com/v1'
          }
        )
      );

      const result = await createLLMResponse({
        userKey: {
          baseUrl: 'https://user.example.com/v1'
        } as any,
        body: {
          model: 'gpt-4',
          messages: [{ role: ChatCompletionRequestMessageRoleEnum.User, content: 'hi' }],
          stream: false
        }
      });

      expect(result.usage.usedUserOpenAIKey).toBe(false);
      expect(mockGetAIApi).toHaveBeenCalledWith({
        userKey: {
          baseUrl: 'https://user.example.com/v1'
        },
        timeout: 600000
      });
      expect(createMock.mock.calls[0][1]).toMatchObject({
        path: 'https://model.example.com/v1/chat/completions',
        headers: {
          Authorization: 'Bearer model-key'
        }
      });
      expect(mockSaveLLMRequestRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({
            usage: expect.not.objectContaining({
              usedUserOpenAIKey: expect.anything()
            })
          })
        })
      );
    });

    it('should use user key and default OpenAI baseUrl when only user key is provided', async () => {
      const modelData = createMockModelData({
        requestUrl: 'https://model.example.com/v1/chat/completions',
        requestAuth: 'model-key'
      });
      mockGetLLMModel.mockReturnValue(modelData);
      const createMock = vi.fn().mockResolvedValue(mockTextResponse);
      mockGetAIApi.mockReturnValue(
        createMockAIApiResult(
          {
            chat: {
              completions: {
                create: createMock
              }
            }
          },
          {
            usedUserOpenAIKey: true,
            baseUrl: 'https://api.openai.com/v1'
          }
        )
      );

      const result = await createLLMResponse({
        userKey: {
          key: 'user-key'
        } as any,
        body: {
          model: 'gpt-4',
          messages: [{ role: ChatCompletionRequestMessageRoleEnum.User, content: 'hi' }],
          stream: false
        }
      });

      expect(result.usage.usedUserOpenAIKey).toBe(true);
      expect(mockGetAIApi).toHaveBeenCalledWith({
        userKey: {
          key: 'user-key'
        },
        timeout: 600000
      });
      expect(createMock.mock.calls[0][1]).not.toHaveProperty('path');
      expect(createMock.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
      expect(mockSaveLLMRequestRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({
            usage: expect.not.objectContaining({
              usedUserOpenAIKey: expect.anything()
            })
          })
        })
      );
    });

    it('should not save usage when user request fails', async () => {
      const createMock = vi.fn().mockRejectedValue(new Error('upstream failed'));
      mockGetAIApi.mockReturnValue(
        createMockAIApiResult(
          {
            chat: {
              completions: {
                create: createMock
              }
            }
          },
          {
            usedUserOpenAIKey: true,
            baseUrl: 'https://api.openai.com/v1'
          }
        )
      );

      const result = await createLLMResponse({
        throwError: false,
        userKey: {
          key: 'user-key'
        } as any,
        body: {
          model: 'gpt-4',
          messages: [{ role: ChatCompletionRequestMessageRoleEnum.User, content: 'hi' }],
          stream: false
        }
      });

      expect(result.usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        usedUserOpenAIKey: false
      });
      expect(mockSaveLLMRequestRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({
            error: expect.stringContaining('您的 OpenAI key 出错了')
          })
        })
      );
      expect(mockSaveLLMRequestRecord.mock.calls[0][0].response).not.toHaveProperty('usage');
    });
  });

  describe('Non-stream text output', () => {
    it('should handle simple non-stream text response', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello! How can I help you?'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 8,
          total_tokens: 18
        }
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' }
      ];

      let streamedText = '';
      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: false
        },
        onStreaming: ({ text }) => {
          streamedText += text;
        }
      });

      expect(result.isStreamResponse).toBe(false);
      expect(result.answerText).toBe('Hello! How can I help you?');
      expect(result.reasoningText).toBe('');
      expect(result.finish_reason).toBe('stop');
      expect(result.toolCalls).toBeUndefined();
      expect(streamedText).toBe('Hello! How can I help you?');
    });

    it('should fill stop finish reason for non-stream response when finish reason is missing', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Hello without finish reason'
            },
            finish_reason: null
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 4,
          total_tokens: 14
        }
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' }
      ];

      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: false
        }
      });

      expect(result.answerText).toBe('Hello without finish reason');
      expect(result.finish_reason).toBe('stop');
      expect(result.error).toBeUndefined();
      expect(mockSaveLLMRequestRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({
            answerText: 'Hello without finish reason',
            finish_reason: 'stop',
            error: undefined
          })
        })
      );
    });

    it('should handle non-stream response with null content', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 0,
          total_tokens: 10
        }
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' }
      ];

      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: false
        }
      });

      expect(result.answerText).toBe('');
      expect(result.responseEmptyTip).toBeDefined();
    });
  });

  describe('Stream text output', () => {
    it('should handle simple stream text response', async () => {
      const chunks = [
        {
          choices: [{ delta: { role: 'assistant', content: 'Hello' }, finish_reason: null }]
        },
        {
          choices: [{ delta: { content: ' World' }, finish_reason: null }]
        },
        {
          choices: [{ delta: { content: '!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
        }
      ];

      const mockStreamResponse = createMockStreamResponse(chunks);
      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockStreamResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      // Mock parseLLMStreamResponse
      let contentBuffer = '';
      mockParseLLMStreamResponse.mockReturnValue({
        parsePart: ({ part }: { part: any }) => {
          const content = part.choices?.[0]?.delta?.content || '';
          contentBuffer += content;
          return {
            reasoningContent: '',
            content,
            responseContent: content,
            finishReason: part.choices?.[0]?.finish_reason || null
          };
        },
        getResponseData: () => ({
          error: undefined,
          reasoningContent: '',
          content: contentBuffer,
          finish_reason: 'stop' as const,
          usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 }
        }),
        updateFinishReason: vi.fn(),
        updateError: vi.fn()
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hi' }
      ];

      let streamedText = '';
      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: true
        },
        onStreaming: ({ text }) => {
          streamedText += text;
        }
      });

      expect(result.isStreamResponse).toBe(true);
      expect(result.answerText).toBe('Hello World!');
      expect(result.finish_reason).toBe('stop');
      expect(streamedText).toBe('Hello World!');
    });

    it('should fill abnormal close finish reason for partial stream response when finish reason is missing', async () => {
      const chunks = [
        {
          choices: [
            { delta: { role: 'assistant', content: 'Partial answer' }, finish_reason: null }
          ]
        }
      ];

      const mockStreamResponse = createMockStreamResponse(chunks);
      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockStreamResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      let contentBuffer = '';
      mockParseLLMStreamResponse.mockReturnValue({
        parsePart: ({ part }: { part: any }) => {
          const content = part.choices?.[0]?.delta?.content || '';
          contentBuffer += content;
          return {
            reasoningContent: '',
            content,
            responseContent: content,
            finishReason: part.choices?.[0]?.finish_reason || null
          };
        },
        getResponseData: () => ({
          error: undefined,
          reasoningContent: '',
          content: contentBuffer,
          finish_reason: null,
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
        }),
        updateFinishReason: vi.fn(),
        updateError: vi.fn()
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hi' }
      ];

      let streamedText = '';
      const result = await createLLMResponse({
        throwError: false,
        body: {
          model: 'gpt-4',
          messages,
          stream: true
        },
        onStreaming: ({ text }) => {
          streamedText += text;
        }
      });

      expect(result.answerText).toBe('Partial answer');
      expect(result.finish_reason).toBe('abnormal_close');
      expect(result.error).toBeUndefined();
      expect(result.responseEmptyTip).toBeUndefined();
      expect(streamedText).toBe('Partial answer');
      expect(mockSaveLLMRequestRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({
            answerText: 'Partial answer',
            finish_reason: 'abnormal_close',
            error: undefined
          })
        })
      );
    });

    it('should handle stream response abort', async () => {
      const chunks = [
        {
          choices: [{ delta: { role: 'assistant', content: 'Hello' }, finish_reason: null }]
        },
        {
          choices: [{ delta: { content: ' World' }, finish_reason: null }]
        }
      ];

      const mockStreamResponse = createMockStreamResponse(chunks);
      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockStreamResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      let contentBuffer = '';
      let currentFinishReason: any = null;
      mockParseLLMStreamResponse.mockReturnValue({
        parsePart: ({ part }: { part: any }) => {
          const content = part.choices?.[0]?.delta?.content || '';
          contentBuffer += content;
          return {
            reasoningContent: '',
            content,
            responseContent: content,
            finishReason: part.choices?.[0]?.finish_reason || null
          };
        },
        getResponseData: () => ({
          error: undefined,
          reasoningContent: '',
          content: contentBuffer,
          finish_reason: currentFinishReason,
          usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 }
        }),
        updateFinishReason: (reason: any) => {
          currentFinishReason = reason;
        },
        updateError: vi.fn()
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hi' }
      ];

      let callCount = 0;
      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: true
        },
        isAborted: () => {
          callCount++;
          return callCount > 1; // Abort after first chunk
        }
      });

      expect(result.finish_reason).toBe('close');
    });
  });

  describe('Reasoning (thinking) output', () => {
    it('should handle non-stream response with reasoning_content', async () => {
      mockGetLLMModel.mockReturnValue(createMockModelData({ reasoning: true }));

      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'The answer is 4.',
              reasoning_content: 'Let me think... 2 + 2 = 4'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 20,
          total_tokens: 30
        }
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'What is 2 + 2?' }
      ];

      let reasoningText = '';
      let answerText = '';
      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: false
        },
        onReasoning: ({ text }) => {
          reasoningText += text;
        },
        onStreaming: ({ text }) => {
          answerText += text;
        }
      });

      expect(result.answerText).toBe('The answer is 4.');
      expect(result.reasoningText).toBe('Let me think... 2 + 2 = 4');
      expect(reasoningText).toBe('Let me think... 2 + 2 = 4');
      expect(answerText).toBe('The answer is 4.');
    });

    it('should handle non-stream response with think tag in content', async () => {
      mockGetLLMModel.mockReturnValue(createMockModelData({ reasoning: true }));
      mockParseReasoningContent.mockReturnValue(['Thinking process here', 'Final answer']);

      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: '<think>Thinking process here</think>Final answer'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25
        }
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Think about this' }
      ];

      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: false
        }
      });

      expect(result.answerText).toBe('Final answer');
      expect(result.reasoningText).toBe('Thinking process here');
    });

    it('should handle stream response with reasoning_content', async () => {
      mockGetLLMModel.mockReturnValue(createMockModelData({ reasoning: true }));

      const chunks = [
        {
          choices: [
            { delta: { role: 'assistant', reasoning_content: 'Let me ' }, finish_reason: null }
          ]
        },
        {
          choices: [{ delta: { reasoning_content: 'think...' }, finish_reason: null }]
        },
        {
          choices: [{ delta: { content: 'The answer ' }, finish_reason: null }]
        },
        {
          choices: [{ delta: { content: 'is 4.' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 }
        }
      ];

      const mockStreamResponse = createMockStreamResponse(chunks);
      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockStreamResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      let contentBuffer = '';
      let reasoningBuffer = '';
      mockParseLLMStreamResponse.mockReturnValue({
        parsePart: ({ part }: { part: any }) => {
          const content = part.choices?.[0]?.delta?.content || '';
          const reasoning = part.choices?.[0]?.delta?.reasoning_content || '';
          contentBuffer += content;
          reasoningBuffer += reasoning;
          return {
            reasoningContent: reasoning,
            content,
            responseContent: content,
            finishReason: part.choices?.[0]?.finish_reason || null
          };
        },
        getResponseData: () => ({
          error: undefined,
          reasoningContent: reasoningBuffer,
          content: contentBuffer,
          finish_reason: 'stop' as const,
          usage: { prompt_tokens: 10, completion_tokens: 15, total_tokens: 25 }
        }),
        updateFinishReason: vi.fn(),
        updateError: vi.fn()
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'What is 2 + 2?' }
      ];

      let reasoningText = '';
      let answerText = '';
      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: true
        },
        onReasoning: ({ text }) => {
          reasoningText += text;
        },
        onStreaming: ({ text }) => {
          answerText += text;
        }
      });

      expect(result.answerText).toBe('The answer is 4.');
      expect(result.reasoningText).toBe('Let me think...');
      expect(reasoningText).toBe('Let me think...');
      expect(answerText).toBe('The answer is 4.');
    });
  });

  describe('Tool call output', () => {
    it('should handle non-stream tool call response', async () => {
      const mockToolCalls: ChatCompletionMessageToolCall[] = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "Beijing"}'
          }
        }
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: mockToolCalls
            },
            finish_reason: 'tool_calls'
          }
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 15,
          total_tokens: 35
        }
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get weather information',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' }
              }
            }
          }
        }
      ];

      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: "What's the weather in Beijing?"
        }
      ];

      const toolCallResults: ChatCompletionMessageToolCall[] = [];
      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          tools,
          stream: false
        },
        onToolCall: ({ call }) => {
          toolCallResults.push(call);
        }
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('get_weather');
      expect(result.toolCalls![0].function.arguments).toBe('{"location": "Beijing"}');
      expect(result.finish_reason).toBe('tool_calls');
      expect(toolCallResults).toHaveLength(1);
    });

    it('should mark non-stream tool_calls finish without tool calls as empty response', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: []
            },
            finish_reason: 'tool_calls'
          }
        ],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 5,
          total_tokens: 25
        }
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get weather information',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' }
              }
            }
          }
        }
      ];

      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: "What's the weather in Beijing?"
        }
      ];

      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          tools,
          stream: false
        }
      });

      expect(result.finish_reason).toBe('tool_calls');
      expect(result.toolCalls).toBeUndefined();
      expect(result.responseEmptyTip).toBe('chat:LLM_model_response_empty');
      expect(result.assistantMessage).not.toHaveProperty('tool_calls');
      expect(mockSaveLLMRequestRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({
            finish_reason: 'tool_calls',
            usage: expect.objectContaining({
              inputTokens: 20,
              outputTokens: 5
            }),
            error: 'chat:LLM_model_response_empty'
          })
        })
      );
    });

    it('should handle stream tool call response', async () => {
      const chunks = [
        {
          choices: [
            {
              delta: {
                role: 'assistant',
                tool_calls: [{ index: 0, function: { name: 'get_weather', arguments: '' } }]
              },
              finish_reason: null
            }
          ]
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: '{"loc' } }]
              },
              finish_reason: null
            }
          ]
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: 'ation":' } }]
              },
              finish_reason: null
            }
          ]
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: '"Beijing"}' } }]
              },
              finish_reason: 'tool_calls'
            }
          ],
          usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 }
        }
      ];

      const mockStreamResponse = createMockStreamResponse(chunks);
      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockStreamResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      mockParseLLMStreamResponse.mockReturnValue({
        parsePart: ({ part }: { part: any }) => {
          return {
            reasoningContent: '',
            content: '',
            responseContent: '',
            finishReason: part.choices?.[0]?.finish_reason || null
          };
        },
        getResponseData: () => ({
          error: undefined,
          reasoningContent: '',
          content: '',
          finish_reason: 'tool_calls' as const,
          usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 }
        }),
        updateFinishReason: vi.fn(),
        updateError: vi.fn()
      });

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get weather information',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' }
              }
            }
          }
        }
      ];

      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: "What's the weather in Beijing?"
        }
      ];

      const toolCallResults: ChatCompletionMessageToolCall[] = [];
      const toolParamResults: string[] = [];
      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          tools,
          stream: true
        },
        onToolCall: ({ call }) => {
          toolCallResults.push(call);
        },
        onToolParam: ({ argsDelta }) => {
          toolParamResults.push(argsDelta);
        }
      });

      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('get_weather');
      expect(result.finish_reason).toBe('tool_calls');
      expect(toolCallResults.length).toBeGreaterThan(0);
    });

    it('should mark stream tool_calls finish without parsed tool calls as empty response', async () => {
      const chunks = [
        {
          choices: [{ delta: { role: 'assistant' }, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }
        }
      ];

      const mockStreamResponse = createMockStreamResponse(chunks);
      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockStreamResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      mockParseLLMStreamResponse.mockReturnValue({
        parsePart: ({ part }: { part: any }) => {
          return {
            reasoningContent: '',
            content: '',
            responseContent: '',
            finishReason: part.choices?.[0]?.finish_reason || null
          };
        },
        getResponseData: () => ({
          error: undefined,
          reasoningContent: '',
          content: '',
          finish_reason: 'tool_calls' as const,
          usage: { prompt_tokens: 20, completion_tokens: 5, total_tokens: 25 }
        }),
        updateFinishReason: vi.fn(),
        updateError: vi.fn()
      });

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get weather information',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' }
              }
            }
          }
        }
      ];

      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: "What's the weather in Beijing?"
        }
      ];

      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          tools,
          stream: true
        }
      });

      expect(result.finish_reason).toBe('tool_calls');
      expect(result.toolCalls).toBeUndefined();
      expect(result.responseEmptyTip).toBe('chat:LLM_model_response_empty');
      expect(result.assistantMessage).not.toHaveProperty('tool_calls');
      expect(mockSaveLLMRequestRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({
            finish_reason: 'tool_calls',
            usage: expect.objectContaining({
              inputTokens: 20,
              outputTokens: 5
            }),
            error: 'chat:LLM_model_response_empty'
          })
        })
      );
    });

    it('should handle multiple tool calls in non-stream response', async () => {
      const mockToolCalls: ChatCompletionMessageToolCall[] = [
        {
          id: 'call_1',
          type: 'function',
          function: {
            name: 'get_weather',
            arguments: '{"location": "Beijing"}'
          }
        },
        {
          id: 'call_2',
          type: 'function',
          function: {
            name: 'get_time',
            arguments: '{"timezone": "Asia/Shanghai"}'
          }
        }
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: mockToolCalls
            },
            finish_reason: 'tool_calls'
          }
        ],
        usage: {
          prompt_tokens: 25,
          completion_tokens: 30,
          total_tokens: 55
        }
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'get_weather',
            description: 'Get weather',
            parameters: { type: 'object', properties: { location: { type: 'string' } } }
          }
        },
        {
          type: 'function' as const,
          function: {
            name: 'get_time',
            description: 'Get time',
            parameters: { type: 'object', properties: { timezone: { type: 'string' } } }
          }
        }
      ];

      const messages: ChatCompletionMessageParam[] = [
        {
          role: ChatCompletionRequestMessageRoleEnum.User,
          content: "What's the weather and time in Beijing?"
        }
      ];

      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          tools,
          stream: false
        }
      });

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls![0].function.name).toBe('get_weather');
      expect(result.toolCalls![1].function.name).toBe('get_time');
    });
  });

  describe('Mixed output (text + tool calls)', () => {
    it('should handle response with both text and tool calls', async () => {
      const mockToolCalls: ChatCompletionMessageToolCall[] = [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'search',
            arguments: '{"query": "AI news"}'
          }
        }
      ];

      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Let me search for that.',
              tool_calls: mockToolCalls
            },
            finish_reason: 'tool_calls'
          }
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 20,
          total_tokens: 35
        }
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const tools = [
        {
          type: 'function' as const,
          function: {
            name: 'search',
            description: 'Search the web',
            parameters: { type: 'object', properties: { query: { type: 'string' } } }
          }
        }
      ];

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Search for AI news' }
      ];

      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          tools,
          stream: false
        }
      });

      expect(result.answerText).toBe('Let me search for that.');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe('search');
    });
  });

  describe('Error handling', () => {
    it('should handle API error with throwError=true', async () => {
      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('API Error'))
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' }
      ];

      await expect(
        createLLMResponse({
          throwError: true,
          body: {
            model: 'gpt-4',
            messages,
            stream: false
          }
        })
      ).rejects.toThrow();
    });

    it('should keep usage from API error response with throwError=false', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: ''
            },
            finish_reason: 'stop'
          }
        ],
        error: new Error('Some error'),
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12
        }
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' }
      ];

      const result = await createLLMResponse({
        throwError: false,
        body: {
          model: 'gpt-4',
          messages,
          stream: false
        }
      });

      expect(result.error).toBeDefined();
      expect(result.finish_reason).toBe('error');
      expect(result.usage.inputTokens).toBe(10);
      expect(result.usage.outputTokens).toBe(2);
    });

    it('should keep usage when stream is interrupted with partial response', async () => {
      const errorChunks = [
        {
          choices: [{ delta: { content: 'Hello' }, finish_reason: null }]
        }
      ];

      const generator = (async function* () {
        for (const chunk of errorChunks) {
          yield chunk;
        }
        throw new Error('Stream interrupted');
      })();

      const mockStreamResponse = Object.assign(generator, {
        controller: { abort: vi.fn() }
      }) as unknown as StreamResponseType;

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockStreamResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      let capturedError: any = null;
      mockParseLLMStreamResponse.mockReturnValue({
        parsePart: ({ part }: { part: any }) => {
          return {
            reasoningContent: '',
            content: part.choices?.[0]?.delta?.content || '',
            responseContent: part.choices?.[0]?.delta?.content || '',
            finishReason: part.choices?.[0]?.finish_reason || null
          };
        },
        getResponseData: () => ({
          error: capturedError,
          reasoningContent: '',
          content: 'Hello',
          finish_reason: null,
          usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }
        }),
        updateFinishReason: vi.fn(),
        updateError: (error: any) => {
          capturedError = error;
        }
      });

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' }
      ];

      const result = await createLLMResponse({
        throwError: false,
        body: {
          model: 'gpt-4',
          messages,
          stream: true
        }
      });

      expect(result.answerText).toBe('Hello');
      expect(result.finish_reason).toBe('error');
      expect(result.error).toBeDefined();
      expect(result.usage.inputTokens).toBe(5);
      expect(result.usage.outputTokens).toBe(1);
      expect(mockSaveLLMRequestRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.objectContaining({
            answerText: 'Hello',
            finish_reason: 'error',
            error: expect.any(Error)
          })
        })
      );
    });
  });

  describe('Usage calculation', () => {
    it('should correctly calculate token usage from response', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Response text'
            },
            finish_reason: 'stop'
          }
        ],
        usage: {
          prompt_tokens: 50,
          completion_tokens: 30,
          total_tokens: 80
        }
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' }
      ];

      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: false
        }
      });

      expect(result.usage.inputTokens).toBe(50);
      expect(result.usage.outputTokens).toBe(30);
    });

    it('should fallback to token counting when usage not provided', async () => {
      mockCountGptMessagesTokens
        .mockResolvedValueOnce(45) // Input tokens
        .mockResolvedValueOnce(25); // Output tokens

      const mockResponse = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Response text'
            },
            finish_reason: 'stop'
          }
        ]
        // No usage field
      };

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue(mockResponse)
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Hello' }
      ];

      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: false
        }
      });

      expect(result.usage.inputTokens).toBe(45);
      expect(result.usage.outputTokens).toBe(25);
    });
  });

  describe('Message continuation (length limit)', () => {
    it('should continue when finish_reason is length', async () => {
      const mockResponse1 = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Part 1 of the response...'
            },
            finish_reason: 'length'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
      };

      const mockResponse2 = {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Part 2 completed.'
            },
            finish_reason: 'stop'
          }
        ],
        usage: { prompt_tokens: 35, completion_tokens: 15, total_tokens: 50 }
      };

      const mockCreate = vi
        .fn()
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      const mockAI = {
        chat: {
          completions: {
            create: mockCreate
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Write a long story' }
      ];

      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: false
        },
        maxContinuations: 5
      });

      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(result.answerText).toBe('Part 1 of the response...Part 2 completed.');
      expect(result.finish_reason).toBe('stop');
      expect(result.usage.inputTokens).toBe(45); // 10 + 35
      expect(result.usage.outputTokens).toBe(35); // 20 + 15
    });

    it('should respect maxContinuations limit', async () => {
      const createLengthResponse = (part: number) => ({
        choices: [
          {
            message: {
              role: 'assistant',
              content: `Part ${part}...`
            },
            finish_reason: 'length'
          }
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 }
      });

      const mockCreate = vi.fn().mockResolvedValue(createLengthResponse(1));

      const mockAI = {
        chat: {
          completions: {
            create: mockCreate
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const messages: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'Write forever' }
      ];

      const result = await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages,
          stream: false
        },
        maxContinuations: 3
      });

      expect(mockCreate).toHaveBeenCalledTimes(3);
      expect(result.finish_reason).toBe('length');
    });
  });

  describe('reasoning_effort handling', () => {
    const buildOkResponse = () => ({
      choices: [
        {
          message: { role: 'assistant', content: 'ok' },
          finish_reason: 'stop'
        }
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    });

    it('should preserve reasoning_effort when model supports it', async () => {
      mockGetLLMModel.mockReturnValue(createMockModelData({ reasoning: true }));
      mockGetLLMSupportParams.mockReturnValueOnce({
        ...defaultSupportParams,
        reasoning: true,
        reasoningEffort: true
      });

      const mockCreate = vi.fn().mockResolvedValue(buildOkResponse());
      mockGetAIApi.mockReturnValue(
        createMockAIApiResult({
          chat: { completions: { create: mockCreate } }
        })
      );

      await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages: [{ role: ChatCompletionRequestMessageRoleEnum.User, content: 'hi' }],
          reasoning_effort: 'high',
          stream: false
        }
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate.mock.calls[0][0].reasoning_effort).toBe('high');
      expect(mockSaveLLMRequestRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'test-request-id',
          body: expect.objectContaining({
            reasoning_effort: 'high'
          }),
          response: expect.objectContaining({
            finish_reason: 'stop'
          })
        })
      );
    });

    it('should strip reasoning_effort when model does not support it', async () => {
      mockGetLLMSupportParams.mockReturnValueOnce({
        ...defaultSupportParams,
        reasoningEffort: false
      });

      const mockCreate = vi.fn().mockResolvedValue(buildOkResponse());
      mockGetAIApi.mockReturnValue(
        createMockAIApiResult({
          chat: { completions: { create: mockCreate } }
        })
      );

      await createLLMResponse({
        body: {
          model: 'gpt-4',
          messages: [{ role: ChatCompletionRequestMessageRoleEnum.User, content: 'hi' }],
          reasoning_effort: 'high',
          stream: false
        }
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate.mock.calls[0][0]).not.toHaveProperty('reasoning_effort');
      expect(mockSaveLLMRequestRecord).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.not.objectContaining({
            reasoning_effort: expect.anything()
          }),
          response: expect.not.objectContaining({
            reasoning_effort: expect.anything()
          })
        })
      );
    });
  });

  describe('Error handling - requestMessages provenance', () => {
    it('should return prompt-rewritten requestMessages on API error', async () => {
      const loaded: ChatCompletionMessageParam[] = [
        { role: ChatCompletionRequestMessageRoleEnum.System, content: 'sys' },
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'q' }
      ];
      const rewritten: ChatCompletionMessageParam[] = [
        ...loaded,
        { role: ChatCompletionRequestMessageRoleEnum.User, content: 'rewritten-suffix' }
      ];

      mockLoadRequestMessages.mockResolvedValueOnce(loaded as any);
      mockPromptToolCallMessageRewrite.mockReturnValueOnce(rewritten as any);

      const mockAI = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error('boom'))
          }
        }
      };
      mockGetAIApi.mockReturnValue(createMockAIApiResult(mockAI));

      const result = await createLLMResponse({
        throwError: false,
        body: {
          model: 'gpt-4',
          messages: [{ role: ChatCompletionRequestMessageRoleEnum.User, content: 'q' }],
          tools: [
            {
              type: 'function' as const,
              function: {
                name: 'noop',
                description: 'n',
                parameters: { type: 'object', properties: {} }
              }
            }
          ],
          toolCallMode: 'prompt',
          stream: false
        }
      });

      expect(result.error).toBeDefined();
      expect(result.requestMessages).toEqual(rewritten);
      expect(result.completeMessages).toEqual(rewritten);
    });
  });
});
