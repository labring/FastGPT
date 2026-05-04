import { afterEach, describe, expect, it, vi } from 'vitest';

const importConfig = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/config');
};

describe('AI config defaults', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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
});
