import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  AIPROXY_API_ENDPOINT: process.env.AIPROXY_API_ENDPOINT,
  AIPROXY_API_TOKEN: process.env.AIPROXY_API_TOKEN,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  CHAT_API_KEY: process.env.CHAT_API_KEY
};

const importConfig = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/config');
};

describe('AI config defaults', () => {
  afterEach(() => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', originalEnv.AIPROXY_API_ENDPOINT);
    vi.stubEnv('AIPROXY_API_TOKEN', originalEnv.AIPROXY_API_TOKEN);
    vi.stubEnv('OPENAI_BASE_URL', originalEnv.OPENAI_BASE_URL);
    vi.stubEnv('CHAT_API_KEY', originalEnv.CHAT_API_KEY);
  });

  it('falls back to OpenAI config when AI Proxy is not explicitly configured', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', '');
    vi.stubEnv('AIPROXY_API_TOKEN', '');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.com/v1');
    vi.stubEnv('CHAT_API_KEY', 'sk-chat');

    const { openaiBaseUrl, openaiBaseKey } = await importConfig();

    expect(openaiBaseUrl).toBe('https://example.com/v1');
    expect(openaiBaseKey).toBe('sk-chat');
  });

  it('uses AI Proxy only when the endpoint is explicitly configured', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000');
    vi.stubEnv('AIPROXY_API_TOKEN', 'aiproxy-token');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.com/v1');
    vi.stubEnv('CHAT_API_KEY', 'sk-chat');

    const { openaiBaseUrl, openaiBaseKey } = await importConfig();

    expect(openaiBaseUrl).toBe('http://aiproxy:3000/v1');
    expect(openaiBaseKey).toBe('aiproxy-token');
  });

  it('normalizes trailing slashes from AI Proxy endpoint', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000///');
    vi.stubEnv('AIPROXY_API_TOKEN', 'aiproxy-token');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.com/v1');
    vi.stubEnv('CHAT_API_KEY', 'sk-chat');

    const { openaiBaseUrl, openaiBaseKey } = await importConfig();

    expect(openaiBaseUrl).toBe('http://aiproxy:3000/v1');
    expect(openaiBaseKey).toBe('aiproxy-token');
  });

  it('falls back to chat API key when AI Proxy endpoint has no token', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000');
    vi.stubEnv('AIPROXY_API_TOKEN', undefined);
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.com/v1');
    vi.stubEnv('CHAT_API_KEY', 'sk-chat');

    const { openaiBaseUrl, openaiBaseKey } = await importConfig();

    expect(openaiBaseUrl).toBe('http://aiproxy:3000/v1');
    expect(openaiBaseKey).toBe('sk-chat');
  });

  it('ignores AI Proxy token when endpoint is not configured', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', '');
    vi.stubEnv('AIPROXY_API_TOKEN', 'aiproxy-token');
    vi.stubEnv('OPENAI_BASE_URL', 'https://example.com/v1');
    vi.stubEnv('CHAT_API_KEY', 'sk-chat');

    const { openaiBaseUrl, openaiBaseKey } = await importConfig();

    expect(openaiBaseUrl).toBe('https://example.com/v1');
    expect(openaiBaseKey).toBe('sk-chat');
  });
});

describe('AI config user OpenAI account', () => {
  const originalSystemEnv = global.systemEnv;

  beforeEach(() => {
    global.systemEnv = {
      ...(global.systemEnv || {}),
      oneapiUrl: 'https://system.example.com/v1',
      chatApiKey: 'system-key'
    } as any;
  });

  afterEach(() => {
    global.systemEnv = originalSystemEnv;
  });

  it('should ignore user baseUrl when user key is missing', async () => {
    const { getAIApi, getAxiosConfig } = await importConfig();

    expect(
      getAxiosConfig({
        userKey: {
          baseUrl: 'https://user.example.com/v1'
        } as any
      })
    ).toEqual({
      baseUrl: 'https://system.example.com/v1',
      authorization: 'Bearer system-key'
    });
    expect(
      getAIApi({
        userKey: {
          baseUrl: 'https://user.example.com/v1'
        } as any
      }).requestMeta
    ).toEqual({
      usedUserOpenAIKey: false,
      baseUrl: 'https://system.example.com/v1'
    });
  });

  it('should normalize user account with default OpenAI baseUrl when only key is provided', async () => {
    const { defaultUserOpenAIBaseUrl, getAIApi, getAxiosConfig } = await importConfig();

    expect(
      getAxiosConfig({
        userKey: {
          key: 'user-key'
        } as any
      })
    ).toEqual({
      baseUrl: defaultUserOpenAIBaseUrl,
      authorization: 'Bearer user-key'
    });
    expect(
      getAIApi({
        userKey: {
          key: 'user-key'
        } as any
      }).requestMeta
    ).toEqual({
      usedUserOpenAIKey: true,
      baseUrl: defaultUserOpenAIBaseUrl
    });
  });

  it('should use user baseUrl only when user key is valid', async () => {
    const { getAIApi, getAxiosConfig } = await importConfig();

    expect(
      getAxiosConfig({
        userKey: {
          key: 'user-key',
          baseUrl: 'https://user.example.com/v1'
        }
      })
    ).toEqual({
      baseUrl: 'https://user.example.com/v1',
      authorization: 'Bearer user-key'
    });
    expect(
      getAIApi({
        userKey: {
          key: 'user-key',
          baseUrl: 'https://user.example.com/v1'
        }
      }).requestMeta
    ).toEqual({
      usedUserOpenAIKey: true,
      baseUrl: 'https://user.example.com/v1'
    });
  });
});
