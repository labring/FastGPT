import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { getAIApi } from '@fastgpt/service/core/ai/config';
import { createChatCompletion } from '@fastgpt/service/core/ai/llm/request/createChatCompletion';

vi.mock('@fastgpt/service/core/ai/config', () => ({
  getAIApi: vi.fn()
}));

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
});
