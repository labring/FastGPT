import { afterEach, describe, expect, it, vi } from 'vitest';

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
