import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import OpenAI from '@fastgpt/global/core/ai';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { createChatCompletion } from '@fastgpt/service/core/ai/llm/request/createChatCompletion';

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

  it('should wrap user key errors with user-facing message', async () => {
    const create = vi.fn().mockRejectedValue(new Error('invalid key'));
    mockApi({
      create,
      usedUserOpenAIKey: true,
      baseUrl: 'https://api.openai.com/v1'
    });

    await expect(
      createChatCompletion({
        modelData: createModel(),
        body: createBody(),
        userKey: {
          key: 'user-key'
        } as any
      })
    ).rejects.toMatch('您的 OpenAI key 出错了');
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

  it('should still log real upstream errors as error', async () => {
    const create = vi.fn().mockRejectedValue(new Error('upstream 500'));
    mockApi({ create });

    await expect(
      createChatCompletion({ modelData: createModel(), body: createBody() })
    ).rejects.toBeTruthy();

    expect(mockLogger.error).toHaveBeenCalledWith('LLM response error', expect.anything());
    expect(mockLogger.warn).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'should redact media in request-error logs with user key=%s',
    async (usedUserOpenAIKey) => {
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
      const error = new Error('upstream failed', { cause: { request: body } });
      const create = vi.fn().mockRejectedValue(error);
      mockApi({ create, usedUserOpenAIKey });
      const request = createChatCompletion({ modelData: createModel(), body });
      if (usedUserOpenAIKey) await expect(request).rejects.toContain('upstream failed');
      else await expect(request).rejects.toBe(error);

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
      const log = usedUserOpenAIKey ? mockLogger.warn : mockLogger.error;
      expect(log).toHaveBeenCalledExactlyOnceWith(
        usedUserOpenAIKey ? 'User AI API error' : 'LLM response error',
        expect.objectContaining({
          request: { ...body, messages },
          error: expect.objectContaining({
            message: 'upstream failed',
            stack: expect.any(String),
            cause: { request: { ...body, messages } }
          })
        })
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(base64);
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

  it('should not report an aborted user-key request as a key error', async () => {
    const create = vi.fn().mockRejectedValue(new OpenAI.APIUserAbortError());
    mockApi({ create, usedUserOpenAIKey: true, baseUrl: 'https://api.openai.com/v1' });

    // 用户 key 分支会 reject 字符串；中断路径应原样透传 Error 对象
    await expect(
      createChatCompletion({
        modelData: createModel(),
        body: createBody(),
        userKey: { key: 'user-key' } as any
      })
    ).rejects.toBeInstanceOf(Error);
  });
});
