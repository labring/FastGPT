import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { getAIApi, getAiproxyScopeHeaders } from '@fastgpt/service/core/ai/config';
import { createChatCompletion } from '@fastgpt/service/core/ai/llm/request/createChatCompletion';

vi.mock('@fastgpt/service/core/ai/config', () => ({
  getAIApi: vi.fn(),
  getAiproxyScopeHeaders: vi.fn(() => ({}))
}));

const mockGetAIApi = vi.mocked(getAIApi);
const mockGetAiproxyScopeHeaders = vi.mocked(getAiproxyScopeHeaders);

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
    // Scope headers are computed by the real helper (unit-tested in aiproxyScope.test.ts);
    // here we only verify the wiring — the merge must not leak between cases.
    mockGetAiproxyScopeHeaders.mockReturnValue({});
  });

  it('does not set request path or authorization from the model (routing is owned by Channels)', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [] });
    const body = createBody();
    mockApi({ create });

    const result = await createChatCompletion({
      modelData: createModel(),
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
    // requestUrl/requestAuth were removed from models (managed by Channels):
    // the model contributes no path and no Authorization header anymore.
    expect(create).toHaveBeenCalledWith(
      {
        ...body,
        model: 'gpt-4o'
      },
      {
        headers: {
          Accept: 'application/json'
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
      modelData: createModel(),
      body: {
        ...createBody()
      },
      userKey: {
        key: 'user-key'
      } as any
    });

    // design §3.1: the internal modelId must not reach the user's own endpoint.
    expect(create.mock.calls[0][0]).not.toHaveProperty('modelId');
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
    ).rejects.toBe('Chat completion model not found');
    expect(create).not.toHaveBeenCalled();
  });

  it('should inject aiproxy relay scope headers computed from model ownership', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [] });
    mockApi({ create, baseUrl: 'http://aiproxy:3000/v1' });
    mockGetAiproxyScopeHeaders.mockReturnValue({
      'X-Aiproxy-Group': 'fastgpt:tmb:tmb_1',
      'X-Aiproxy-Group-Channel-Mode': 'own'
    });

    const modelData = createModel({ isSystem: false, tmbId: 'tmb_1' });
    await createChatCompletion({
      modelData,
      body: createBody(),
      options: {
        headers: {
          Accept: 'application/json'
        }
      }
    });

    expect(mockGetAiproxyScopeHeaders).toHaveBeenCalledWith(modelData, 'http://aiproxy:3000/v1');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-4o' }),
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          'X-Aiproxy-Group': 'fastgpt:tmb:tmb_1',
          'X-Aiproxy-Group-Channel-Mode': 'own'
        }
      })
    );
  });

  it('should let relay scope headers win over caller-provided headers', async () => {
    const create = vi.fn().mockResolvedValue({ choices: [] });
    mockApi({ create, baseUrl: 'http://aiproxy:3000/v1' });
    mockGetAiproxyScopeHeaders.mockReturnValue({
      'X-Aiproxy-Group-Channel-Mode': 'global'
    });

    await createChatCompletion({
      modelData: createModel({ isSystem: true }),
      body: createBody(),
      options: {
        headers: {
          'X-Aiproxy-Group-Channel-Mode': 'own'
        }
      }
    });

    expect(create).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: {
          'X-Aiproxy-Group-Channel-Mode': 'global'
        }
      })
    );
  });
});
