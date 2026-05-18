import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';

const providerMocks = vi.hoisted(() => {
  const adapter = {
    provider: 'opensandbox',
    execute: vi.fn(async () => ({
      stdout: '',
      stderr: '',
      exitCode: 0
    }))
  };

  return {
    adapter,
    connectToSandbox: vi.fn(async () => adapter),
    disconnectSandbox: vi.fn(async () => undefined),
    getSandboxCodeServerProxyTarget: vi.fn(async () => ({
      service: 'code-server',
      origin: 'http://sandbox-upstream:44772',
      basePath: '/proxy/8080',
      auth: 'code-server'
    })),
    getSandboxProviderConfig: vi.fn((provider = 'opensandbox') => ({
      provider,
      baseUrl: 'http://sandbox.local',
      apiKey: 'api-key',
      runtime: 'docker'
    }))
  };
});

const schemaMocks = vi.hoisted(() => ({
  findOne: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/sandbox/schema', () => ({
  MongoSandboxInstance: {
    findOne: schemaMocks.findOne
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/provider', () => providerMocks);

import { getSandboxProxyTarget } from '@/service/core/sandbox/proxy';

const sandboxRecord = {
  provider: 'opensandbox',
  sandboxId: 'proxy-target-session-id',
  status: SandboxStatusEnum.running
};

describe('getSandboxProxyTarget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    schemaMocks.findOne.mockReturnValue({
      lean: vi.fn(async () => sandboxRecord)
    });
  });

  it('does not connect stopped sandboxes', async () => {
    schemaMocks.findOne.mockReturnValue({
      lean: vi.fn(async () => ({
        ...sandboxRecord,
        status: SandboxStatusEnum.stopped
      }))
    });

    await expect(getSandboxProxyTarget(sandboxRecord.sandboxId)).rejects.toThrow(
      'Sandbox is not running'
    );

    expect(providerMocks.getSandboxProviderConfig).not.toHaveBeenCalled();
    expect(providerMocks.connectToSandbox).not.toHaveBeenCalled();
    expect(providerMocks.getSandboxCodeServerProxyTarget).not.toHaveBeenCalled();
    expect(providerMocks.disconnectSandbox).not.toHaveBeenCalled();
  });

  it('connects the sandbox before resolving the proxy target', async () => {
    await expect(getSandboxProxyTarget(sandboxRecord.sandboxId)).resolves.toEqual({
      service: 'code-server',
      origin: 'http://sandbox-upstream:44772',
      basePath: '/proxy/8080',
      auth: 'code-server'
    });

    expect(providerMocks.getSandboxProviderConfig).toHaveBeenCalledWith('opensandbox');
    expect(providerMocks.connectToSandbox).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'opensandbox' }),
      sandboxRecord.sandboxId
    );
    expect(providerMocks.getSandboxCodeServerProxyTarget).toHaveBeenCalledWith(
      providerMocks.adapter
    );
    expect(providerMocks.disconnectSandbox).toHaveBeenCalledWith(providerMocks.adapter);
  });
});
