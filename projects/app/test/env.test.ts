import { afterEach, describe, expect, it, vi } from 'vitest';

const importAppEnv = async () => {
  vi.resetModules();
  return import('../src/env');
};

const disableAgentSandboxEnv = () => {
  vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
  vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', '');
  vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', '');
  vi.stubEnv('AGENT_SANDBOX_SEALOS_BASEURL', '');
  vi.stubEnv('AGENT_SANDBOX_SEALOS_TOKEN', '');
  vi.stubEnv('AGENT_SANDBOX_E2B_API_KEY', '');
  vi.stubEnv('AGENT_SANDBOX_PROXY_URL', '');
};

describe('app env validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('未启用 Agent Sandbox 时允许 AGENT_SANDBOX_PROXY_URL 为空', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', '');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', '');

    await expect(importAppEnv()).resolves.toBeDefined();
  });

  it('OPENAPI_KEY_MAX_COUNT 默认值为 100，且允许配置为最小值 1', async () => {
    disableAgentSandboxEnv();
    vi.stubEnv('OPENAPI_KEY_MAX_COUNT', '');

    await expect(importAppEnv()).resolves.toMatchObject({
      appEnv: expect.objectContaining({
        OPENAPI_KEY_MAX_COUNT: 100
      })
    });

    vi.stubEnv('OPENAPI_KEY_MAX_COUNT', '1');

    await expect(importAppEnv()).resolves.toMatchObject({
      appEnv: expect.objectContaining({
        OPENAPI_KEY_MAX_COUNT: 1
      })
    });
  });

  it('OPENAPI_KEY_MAX_COUNT 必须是大于等于 1 的整数', async () => {
    disableAgentSandboxEnv();
    vi.stubEnv('OPENAPI_KEY_MAX_COUNT', '0');

    await expect(importAppEnv()).rejects.toThrow('OPENAPI_KEY_MAX_COUNT');

    vi.stubEnv('OPENAPI_KEY_MAX_COUNT', '1.5');

    await expect(importAppEnv()).rejects.toThrow('OPENAPI_KEY_MAX_COUNT');
  });

  it('启用 opensandbox 时要求配置 AGENT_SANDBOX_PROXY_URL', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'http://mock-opensandbox.local');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', 'mock-opensandbox-api-key');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', '');

    await expect(importAppEnv()).rejects.toThrow('AGENT_SANDBOX_PROXY_URL is required');
  });

  it('启用 opensandbox 时要求 AGENT_SANDBOX_PROXY_URL 是 WebSocket 地址', async () => {
    vi.stubEnv('AGENT_SANDBOX_PROVIDER', 'opensandbox');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_BASEURL', 'http://mock-opensandbox.local');
    vi.stubEnv('AGENT_SANDBOX_OPENSANDBOX_API_KEY', 'mock-opensandbox-api-key');
    vi.stubEnv('AGENT_SANDBOX_PROXY_URL', 'http://localhost:1006');

    await expect(importAppEnv()).rejects.toThrow('AGENT_SANDBOX_PROXY_URL');
  });
});
