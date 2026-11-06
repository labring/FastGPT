import { getTestInstanceConfig } from '@test/utils/instanceConfigSnapshot';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveSystemInstanceConfig } from '@fastgpt/global/common/system/config/schema';
const importConfig = async () => {
  vi.resetModules();
  return import('@fastgpt/service/core/ai/config');
};
beforeEach(() => {
  vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000');
  vi.stubEnv('AIPROXY_API_TOKEN', 'aiproxy-token');
  global.systemInstanceConfig = resolveSystemInstanceConfig({
    subservice: {
      aiProxy: { enabled: true }
    }
  });
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
  it('ignores a configured endpoint while AI Proxy is disabled', async () => {
    // endpoint 的 Schema 默认值是 compose 便利用的 http://localhost:3000；只看 endpoint 会让
    // 没装 AI Proxy 的部署把系统模型流量发到本机 3000，且永远拿不到 OpenAI 兜底。
    global.systemInstanceConfig = resolveSystemInstanceConfig({
      subservice: {
        aiProxy: { enabled: false }
      }
    });
    const { getAiProxyBaseUrl, getOpenaiBaseUrl, getOpenaiBaseKey } = await importConfig();

    expect(getAiProxyBaseUrl()).toBeUndefined();
    expect(getOpenaiBaseUrl()).toBe('https://api.openai.com/v1');
    // 禁用代理后请求会发往外部服务，不能继续携带私有代理凭据
    expect(getOpenaiBaseKey()).toBe('');
  });

  it('normalizes ENV proxy addresses before building request URLs', async () => {
    vi.stubEnv('AIPROXY_API_ENDPOINT', 'http://aiproxy:3000///');
    global.systemInstanceConfig = resolveSystemInstanceConfig({
      subservice: {
        aiProxy: { enabled: true }
      }
    });
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
});
