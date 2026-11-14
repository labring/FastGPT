import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const importConfig = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/config');
};
beforeEach(() => {
  vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000');
  vi.stubEnv('AIPROXY_API_TOKEN', 'aiproxy-token');
});
afterEach(() => vi.unstubAllEnvs());
describe('AI config instance source', () => {
  it('uses the ENV endpoint and token', async () => {
    const { getOpenaiBaseUrl, getOpenaiBaseKey, getAxiosConfig } = await importConfig();
    expect(getOpenaiBaseUrl()).toBe('http://aiproxy:3000/v1');
    expect(getOpenaiBaseKey()).toBe('aiproxy-token');
    expect(getAxiosConfig()).toEqual({
      baseUrl: 'http://aiproxy:3000/v1',
      authorization: 'Bearer aiproxy-token'
    });
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'https://new-proxy.example.com');
    vi.resetModules();
    const reloaded = await importConfig();
    expect(reloaded.getOpenaiBaseUrl()).toBe('https://new-proxy.example.com/v1');
  });
  it('falls back when a configured endpoint has no token', async () => {
    vi.stubEnv('AIPROXY_API_TOKEN', '');
    const { getAiProxyBaseUrl, getOpenaiBaseUrl, getOpenaiBaseKey } = await importConfig();

    expect(getAiProxyBaseUrl()).toBeUndefined();
    expect(getOpenaiBaseUrl()).toBe('https://api.openai.com/v1');
    expect(getOpenaiBaseKey()).toBe('');
  });

  it('does not send a proxy token without an endpoint', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', undefined);
    vi.stubEnv('AIPROXY_API_TOKEN', 'private-proxy-token');
    const { getOpenaiBaseUrl, getOpenaiBaseKey, getAxiosConfig } = await importConfig();

    expect(getOpenaiBaseUrl()).toBe('https://api.openai.com/v1');
    expect(getOpenaiBaseKey()).toBe('');
    expect(getAxiosConfig().authorization).toBe('Bearer ');
    expect(getAxiosConfig().authorization).not.toContain('private-proxy-token');
  });

  it('normalizes ENV proxy addresses before building request URLs', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000///');
    const { getOpenaiBaseUrl } = await importConfig();
    expect(getOpenaiBaseUrl()).toBe('http://aiproxy:3000/v1');
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

  it('uses AIProxy when the user key is missing, ignoring legacy system overrides', async () => {
    const { getAIApi, getAxiosConfig } = await importConfig();

    expect(
      getAxiosConfig({
        userKey: {
          baseUrl: 'https://user.example.com/v1'
        } as any
      })
    ).toEqual({
      baseUrl: 'http://aiproxy:3000/v1',
      authorization: 'Bearer aiproxy-token'
    });
    expect(
      getAIApi({
        userKey: {
          baseUrl: 'https://user.example.com/v1'
        } as any
      }).requestMeta
    ).toEqual({
      usedUserOpenAIKey: false,
      baseUrl: 'http://aiproxy:3000/v1'
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

  it('omits AI Proxy scope headers and selects SSRF-protected axios only for team custom endpoints', async () => {
    const [{ getAiproxyScopeHeaders, getModelRequestClient, openaiBaseUrl }, axiosModule] =
      await Promise.all([importConfig(), import('@fastgpt/service/common/api/axios')]);

    expect(
      getAiproxyScopeHeaders(
        {
          scope: 'team',
          tmbId: 'tmb-1',
          requestUrl: 'https://custom.example.com/v1'
        } as any,
        openaiBaseUrl
      )
    ).toEqual({});

    expect(
      getModelRequestClient({
        scope: 'team',
        requestUrl: 'https://api.example.com/v1'
      })
    ).toBe(axiosModule.axios);
    expect(getModelRequestClient({ scope: 'team' })).toBe(axiosModule.axiosWithoutSSRF);
    expect(
      getModelRequestClient({ scope: 'system', requestUrl: 'https://api.example.com/v1' })
    ).toBe(axiosModule.axiosWithoutSSRF);
  });
});
