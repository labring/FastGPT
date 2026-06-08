import { afterEach, describe, expect, it, vi } from 'vitest';

const importAppEnv = async () => {
  vi.resetModules();
  return import('../src/env');
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
