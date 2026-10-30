import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import OpenAI from '@fastgpt/global/core/ai';
import { isUserConfigError, UserConfigError } from '@fastgpt/global/common/error/utils';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { createChatCompletion } from '@fastgpt/service/core/ai/llm/request/createChatCompletion';
import { createStreamResponse } from '@fastgpt/service/core/ai/llm/request/response/stream';
import * as aiUtils from '@fastgpt/service/core/ai/utils';

const mockLogger = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mockLogger,
  LogCategories: {
    MODULE: {
      AI: { LLM: 'ai.llm' }
    }
  }
}));

vi.mock('@fastgpt/service/core/ai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@fastgpt/service/core/ai/config')>();
  return {
    ...actual,
    getAIApi: vi.fn(),
    getAiproxyScopeHeaders: vi.fn(() => ({}))
  };
});

const mockGetAIApi = vi.mocked(getAIApi);

const createModel = (overrides: Record<string, any> = {}) =>
  ({
    type: ModelTypeEnum.llm,
    provider: 'openai',
    model: 'gpt-4o',
    name: 'GPT-4o',
    maxContext: 128000,
    maxResponse: 4096,
    quoteMaxToken: 60000,
    ...overrides
  }) as any;

const createBody = () =>
  ({
    model: 'alias-model',
    messages: [{ role: 'user', content: 'hi' }],
    stream: false
  }) as any;

const mockApi = ({
  create,
  usedUserOpenAIKey = false,
  baseUrl = 'https://system.example.com/v1'
}: {
  create: ReturnType<typeof vi.fn>;
  usedUserOpenAIKey?: boolean;
  baseUrl?: string;
}) => {
  mockGetAIApi.mockReturnValue({
    ai: {
      chat: {
        completions: {
          create
        }
      }
    },
    requestMeta: {
      usedUserOpenAIKey,
      baseUrl
    }
  } as any);
};

describe('createChatCompletion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use model request path and auth when system key is used', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [] });
    const body = createBody();
    mockApi({ create });

    const result = await createChatCompletion({
      modelData: createModel({
        requestUrl: '/custom/chat/completions',
        requestAuth: 'model-auth'
      }),
      body,
      options: {
        headers: {
          Accept: 'application/json'
        }
      }
    });

    expect(mockGetAIApi).toHaveBeenCalledWith({
      userKey: undefined,
      timeout: 600000
    });
    expect(create).toHaveBeenCalledWith(
      {
        ...body,
        model: 'gpt-4o'
      },
      {
        path: '/custom/chat/completions',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer model-auth'
        }
      }
    );
    expect(result.isStreamResponse).toBe(false);
    expect(result.requestMeta.usedUserOpenAIKey).toBe(false);
  });

  it('should not apply model request path and auth when user key is used', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [] });
    mockApi({
      create,
      usedUserOpenAIKey: true,
      baseUrl: 'https://api.openai.com/v1'
    });

    const result = await createChatCompletion({
      modelData: createModel({
        requestUrl: '/custom/chat/completions',
        requestAuth: 'model-auth'
      }),
      body: createBody(),
      userKey: {
        key: 'user-key'
      } as any
    });

    expect(create.mock.calls[0][1]).toEqual({
      headers: {}
    });
    expect(result.requestMeta.usedUserOpenAIKey).toBe(true);
  });

  it('should detect stream response', async () => {
    const streamResponse = {
      controller: {
        abort: vi.fn()
      }
    };
    const create = vi.fn().mockResolvedValue(streamResponse);
    mockApi({ create });

    const result = await createChatCompletion({
      modelData: createModel(),
      body: {
        ...createBody(),
        stream: true
      }
    });

    expect(result.isStreamResponse).toBe(true);
    expect(result.response).toBe(streamResponse);
  });

  describe('stream error boundary', () => {
    const responseChunk = {
      choices: [{ delta: { content: 'hello' }, finish_reason: null }]
    };
    const parserBody = () => ({ ...createBody(), model: { config: { reasoning: false } } });

    /** 仅替换 HTTP I/O，保留 SDK 的 SSE 解码、异常和取消行为。 */
    const requestStream = async ({
      usedUserOpenAIKey,
      chunks = [responseChunk]
    }: {
      usedUserOpenAIKey: boolean;
      chunks?: unknown[];
    }) => {
      const ai = new OpenAI({
        apiKey: 'test-key',
        maxRetries: 0,
        fetch: async () =>
          new Response(chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join(''), {
            headers: { 'content-type': 'text/event-stream' }
          })
      });
      mockGetAIApi.mockReturnValue({
        ai,
        requestMeta: { usedUserOpenAIKey, baseUrl: 'https://api.openai.com/v1' }
      });
      const result = await createChatCompletion({
        modelData: createModel(),
        body: { ...createBody(), stream: true },
        userKey: { key: 'user-key', baseUrl: 'https://api.openai.com/v1' }
      });
      if (!result.isStreamResponse) throw new Error('Expected a stream response');
      return result.response;
    };

    it.each([false, true])(
      'classifies SDK SSE errors using the actual user-key metadata=%s',
      async (usedUserOpenAIKey) => {
        const response = await requestStream({
          usedUserOpenAIKey,
          chunks: [
            responseChunk,
            {
              error: {
                message: 'invalid user API key',
                type: 'invalid_request_error',
                code: 'invalid_api_key'
              }
            }
          ]
        });
        const result = await createStreamResponse({
          body: parserBody(),
          response,
          requestMeta: { usedUserOpenAIKey }
        });

        expect(result.answerText).toBe('hello');
        expect(isUserConfigError(result.error)).toBe(usedUserOpenAIKey);
        const originalError = usedUserOpenAIKey ? result.error.cause : result.error;
        expect(originalError).toMatchObject({ code: 'invalid_api_key' });
        if (usedUserOpenAIKey) {
          expect(originalError).toBeInstanceOf(OpenAI.APIError);
          expect(mockLogger.info).toHaveBeenCalledExactlyOnceWith(
            'User AI API error',
            expect.objectContaining({ otel: false })
          );
        } else {
          expect(mockLogger.info).not.toHaveBeenCalled();
        }
        expect(mockLogger.error).not.toHaveBeenCalled();
        expect(mockLogger.warn).not.toHaveBeenCalled();
      }
    );

    it.each(['callback', 'parser'] as const)(
      'preserves internal %s failures when using a user key',
      async (source) => {
        const response = await requestStream({ usedUserOpenAIKey: true });
        const error = new TypeError('internal failure');
        const fail = () => {
          throw error;
        };
        if (source === 'parser') {
          const parser = aiUtils.parseLLMStreamResponse();
          const spy = vi
            .spyOn(aiUtils, 'parseLLMStreamResponse')
            .mockReturnValueOnce({ ...parser, parsePart: fail });
          onTestFinished(() => spy.mockRestore());
        }
        const result = await createStreamResponse({
          body: parserBody(),
          response,
          requestMeta: { usedUserOpenAIKey: true },
          onStreaming: source === 'callback' ? fail : undefined
        });

        expect(result.error).toBe(error);
        expect(isUserConfigError(result.error)).toBe(false);
        expect(mockLogger.info).not.toHaveBeenCalled();
        expect(response.controller.signal.aborted).toBe(true);
      }
    );

    it('keeps cancellation connected to the original SDK stream', async () => {
      const response = await requestStream({ usedUserOpenAIKey: true });
      const result = await createStreamResponse({
        body: parserBody(),
        response,
        requestMeta: { usedUserOpenAIKey: true },
        isAborted: () => true
      });

      expect(result.error).toBeUndefined();
      expect(result.finish_reason).toBe('close');
      expect(response.controller.signal.aborted).toBe(true);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  it.each([
    {
      name: 'SDK HTTP error',
      error: new OpenAI.APIError(
        404,
        { error: { message: 'page not found' } },
        'page not found',
        new Headers()
      )
    },
    { name: 'upstream 500', error: Object.assign(new Error('upstream 500'), { status: 500 }) },
    { name: 'network', error: new Error('network failed') },
    { name: 'abort', error: new OpenAI.APIUserAbortError() }
  ])('wraps user-key $name failures and logs only local info', async ({ error: upstreamError }) => {
    const create = vi.fn().mockRejectedValue(upstreamError);
    mockApi({
      create,
      usedUserOpenAIKey: true,
      baseUrl: 'https://api.openai.com/v1'
    });

    const request = createChatCompletion({
      modelData: createModel(),
      body: createBody(),
      userKey: {
        key: 'user-key'
      } as any
    });

    await expect(request).rejects.toBeInstanceOf(UserConfigError);
    await expect(request).rejects.toMatchObject({
      message: expect.stringContaining('您的 OpenAI key 出错了'),
      cause: upstreamError,
      name: 'UserConfigError'
    });

    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.error).not.toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledExactlyOnceWith(
      'User AI API error',
      expect.objectContaining({
        otel: false,
        error: expect.objectContaining({
          message: upstreamError.message
        })
      })
    );
  });

  it('should reject when model config is missing', async () => {
    const create = vi.fn();
    mockApi({ create });

    await expect(
      createChatCompletion({
        modelData: undefined as any,
        body: createBody()
      })
    ).rejects.toBe('alias-model not found');
    expect(create).not.toHaveBeenCalled();
  });

  it('should log aborted requests as warn instead of error', async () => {
    const create = vi.fn().mockRejectedValue(new OpenAI.APIUserAbortError());
    mockApi({ create });

    await expect(
      createChatCompletion({ modelData: createModel(), body: createBody() })
    ).rejects.toBeTruthy();

    expect(mockLogger.warn).toHaveBeenCalledWith('LLM request aborted');
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it('should treat the SDK abort message as aborted even if instanceof fails', async () => {
    // SDK 的 APIUserAbortError 不设置 name（仍是 'Error'），跨副本时 instanceof 也可能失效
    const create = vi.fn().mockRejectedValue(new Error('Request was aborted.'));
    mockApi({ create });

    await expect(
      createChatCompletion({ modelData: createModel(), body: createBody() })
    ).rejects.toBeTruthy();

    expect(mockLogger.warn).toHaveBeenCalledWith('LLM request aborted');
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it.each([500, undefined])('should keep platform key status %s as an error', async (status) => {
    const upstreamError = Object.assign(new Error('upstream failed'), { status });
    const create = vi.fn().mockRejectedValue(upstreamError);
    mockApi({ create });

    await expect(
      createChatCompletion({ modelData: createModel(), body: createBody() })
    ).rejects.toBe(upstreamError);

    expect(mockLogger.error).toHaveBeenCalledExactlyOnceWith(
      'LLM response error',
      expect.anything()
    );
    expect(mockLogger.warn).not.toHaveBeenCalled();
    expect(mockLogger.info).not.toHaveBeenCalled();
  });

  it.each([
    { usedUserOpenAIKey: false, status: undefined },
    { usedUserOpenAIKey: true, status: 500 }
  ])(
    'should redact media in request-error logs with user key=$usedUserOpenAIKey status=$status',
    async ({ usedUserOpenAIKey, status }) => {
      const base64 = 'A'.repeat(1_000_000);
      const body = createBody();
      body.messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze these media files.' },
            { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } },
            { type: 'input_audio', input_audio: { data: base64, format: 'wav' } },
            { type: 'video_url', video_url: { url: `data:video/mp4;base64,${base64}` } },
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
          ]
        }
      ];
      const originalMessages = structuredClone(body.messages);
      const error = Object.assign(new Error('upstream failed', { cause: { request: body } }), {
        status
      });
      const create = vi.fn().mockRejectedValue(error);
      mockApi({ create, usedUserOpenAIKey });
      const request = createChatCompletion({ modelData: createModel(), body });
      if (usedUserOpenAIKey) {
        await expect(request).rejects.toMatchObject({ name: 'UserConfigError' });
      } else {
        await expect(request).rejects.toBe(error);
      }

      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze these media files.' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,[base64 omitted]' } },
            { type: 'input_audio', input_audio: { data: '[base64 omitted]', format: 'wav' } },
            { type: 'video_url', video_url: { url: 'data:video/mp4;base64,[base64 omitted]' } },
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } }
          ]
        }
      ];
      const log = usedUserOpenAIKey ? mockLogger.info : mockLogger.error;
      expect(log).toHaveBeenCalledExactlyOnceWith(
        usedUserOpenAIKey ? 'User AI API error' : 'LLM response error',
        expect.objectContaining({
          ...(usedUserOpenAIKey && { otel: false }),
          request: { ...body, messages },
          error: expect.objectContaining({
            message: 'upstream failed',
            stack: expect.any(String),
            cause: { request: { ...body, messages } }
          })
        })
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(base64);
      expect(mockLogger.warn).not.toHaveBeenCalled();
      if (usedUserOpenAIKey) {
        expect(mockLogger.error).not.toHaveBeenCalled();
      }
      expect(body.messages).toEqual(originalMessages);
      expect(create.mock.calls[0][0]).toBe(body);
      expect(error.cause).toEqual({ request: body });
    }
  );

  it('should not treat an upstream error carrying the abort text as an abort', async () => {
    // SDK 的 makeMessage 会给带 status 的错误加上状态码前缀（如 '500 {...}'），
    // 所以真实上游错误的 message 不可能等于 abort 的固定文案；此处显式锁住该前提，
    // 避免日后有人「补一个 status 守卫」而掩盖了真正需要防的情况。
    const upstream = new OpenAI.APIError(500, { error: {} }, 'Request was aborted.', new Headers());
    expect(upstream.message).not.toBe('Request was aborted.');

    const create = vi.fn().mockRejectedValue(upstream);
    mockApi({ create });

    await expect(
      createChatCompletion({ modelData: createModel(), body: createBody() })
    ).rejects.toBeTruthy();

    expect(mockLogger.error).toHaveBeenCalledWith('LLM response error', expect.anything());
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });
});
