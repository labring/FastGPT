import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  VITEST: process.env.VITEST,
  AIPROXY_API_ENDPOINT: process.env.AIPROXY_API_ENDPOINT,
  AIPROXY_API_TOKEN: process.env.AIPROXY_API_TOKEN,
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
  CHAT_API_KEY: process.env.CHAT_API_KEY
};

/** 重新加载模块，确保每个场景校验当前环境配置而非模块缓存。 */
const importConfig = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/config');
};

beforeEach(() => {
  vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000');
  vi.stubEnv('AIPROXY_API_TOKEN', 'aiproxy-token');
  vi.stubEnv('OPENAI_BASE_URL', 'https://example.com/v1');
  vi.stubEnv('CHAT_API_KEY', 'sk-chat');
});

afterEach(() => {
  vi.stubEnv('NODE_ENV', originalEnv.NODE_ENV);
  vi.stubEnv('VITEST', originalEnv.VITEST);
  vi.stubEnv('AIPROXY_API_ENDPOINT', originalEnv.AIPROXY_API_ENDPOINT);
  vi.stubEnv('AIPROXY_API_TOKEN', originalEnv.AIPROXY_API_TOKEN);
  vi.stubEnv('OPENAI_BASE_URL', originalEnv.OPENAI_BASE_URL);
  vi.stubEnv('CHAT_API_KEY', originalEnv.CHAT_API_KEY);
});

describe('AI config defaults', () => {
  it('uses the required AI Proxy config instead of the legacy OpenAI environment defaults', async () => {
    const { openaiBaseUrl, openaiBaseKey } = await importConfig();

    expect(openaiBaseUrl).toBe('http://aiproxy:3000/v1');
    expect(openaiBaseKey).toBe('aiproxy-token');
  });

  it('normalizes trailing slashes from AI Proxy endpoint', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000///');

    const { openaiBaseUrl, openaiBaseKey } = await importConfig();

    expect(openaiBaseUrl).toBe('http://aiproxy:3000/v1');
    expect(openaiBaseKey).toBe('aiproxy-token');
  });

  it('trims the required AI Proxy token', async () => {
    vi.stubEnv('AIPROXY_API_TOKEN', '  aiproxy-token  ');

    const { openaiBaseKey } = await importConfig();
    expect(openaiBaseKey).toBe('aiproxy-token');
  });

  it.each([undefined, '', '   ', 'not-a-url'])(
    'rejects an invalid AI Proxy endpoint (%s) without falling back to OPENAI_BASE_URL',
    async (endpoint) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VITEST', undefined);
      vi.stubEnv('AIPROXY_API_ENDPOINT', endpoint);

      await expect(importConfig()).rejects.toThrow('AIPROXY_API_ENDPOINT');
    }
  );

  it.each([undefined, '', '   '])(
    'rejects a missing or blank AI Proxy token (%s) without falling back to CHAT_API_KEY',
    async (token) => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('VITEST', undefined);
      vi.stubEnv('AIPROXY_API_TOKEN', token);

      await expect(importConfig()).rejects.toThrow('AIPROXY_API_TOKEN');
    }
  );
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
