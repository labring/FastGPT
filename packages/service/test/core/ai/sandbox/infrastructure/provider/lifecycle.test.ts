import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildSandboxAdapter: vi.fn(),
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => mocks.logger,
  LogCategories: {
    MODULE: {
      AI: {
        SANDBOX: 'sandbox'
      }
    }
  }
}));

vi.mock('@fastgpt/service/core/ai/sandbox/infrastructure/provider/adapter', () => ({
  buildSandboxAdapter: mocks.buildSandboxAdapter
}));

import {
  connectReadySandboxByInstance,
  connectToSandbox,
  ensureConnectedSandboxRunning,
  getReadySandboxInfo
} from '@fastgpt/service/core/ai/sandbox/infrastructure/provider/lifecycle';

const opensandboxConfig = {
  provider: 'opensandbox' as const,
  baseUrl: 'http://sandbox.local',
  apiKey: 'api-key',
  runtime: 'docker' as const
};

const sealosConfig = {
  provider: 'sealosdevbox' as const,
  baseUrl: 'http://sandbox.local',
  token: 'api-key'
};

const createSandbox = (overrides: Record<string, unknown> = {}) =>
  ({
    provider: 'opensandbox',
    id: 'provider-sandbox-id',
    status: { state: 'Running' },
    ensureRunning: vi.fn(async () => undefined),
    waitUntilReady: vi.fn(async () => undefined),
    execute: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    getInfo: vi.fn(async () => null),
    close: vi.fn(async () => undefined),
    ...overrides
  }) as any;

describe('sandbox provider lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildSandboxAdapter.mockReturnValue(createSandbox());
  });

  it('connects sandbox by stable sandbox id through ensureRunning', async () => {
    const result = await connectToSandbox(opensandboxConfig, 'sandbox-1');

    expect(result.provider).toBe('opensandbox');
    expect(mocks.buildSandboxAdapter).toHaveBeenCalledWith(opensandboxConfig, {
      sandboxId: 'sandbox-1'
    });
    expect(result.ensureRunning).toHaveBeenCalledTimes(1);
    expect(result.waitUntilReady).not.toHaveBeenCalled();
  });

  it('does not add provider-specific readiness probes in the app layer', async () => {
    const sandbox = createSandbox({
      provider: 'sealosdevbox',
      getInfo: vi.fn(async () => {
        throw new Error('Devbox API returned non-JSON response (503): no healthy upstream');
      })
    });
    mocks.buildSandboxAdapter.mockReturnValueOnce(sandbox);

    await expect(
      connectToSandbox(sealosConfig, 'sandbox-transient-upstream')
    ).resolves.toMatchObject({
      provider: 'sealosdevbox'
    });

    expect(sandbox.getInfo).not.toHaveBeenCalled();
    expect(sandbox.ensureRunning).toHaveBeenCalledTimes(1);
    expect(sandbox.waitUntilReady).not.toHaveBeenCalled();
    expect(sandbox.execute).not.toHaveBeenCalled();
  });

  it('delegates provider-specific readiness to the SDK adapter', async () => {
    const sandbox = createSandbox({
      provider: 'opensandbox'
    });

    await ensureConnectedSandboxRunning(sandbox);

    expect(sandbox.ensureRunning).toHaveBeenCalledTimes(1);
    expect(sandbox.waitUntilReady).not.toHaveBeenCalled();
    expect(sandbox.execute).not.toHaveBeenCalled();
  });

  it('falls back when reading ready sandbox info fails after availability check', async () => {
    const sandbox = createSandbox({
      provider: 'sealosdevbox',
      getInfo: vi.fn(async () => {
        throw new Error('Devbox API returned non-JSON response (503): no healthy upstream');
      })
    });

    await expect(
      getReadySandboxInfo(sandbox, {
        sandboxId: 'stable-session-id',
        image: { repository: 'fallback-image', tag: 'latest' },
        entrypoint: [],
        status: { state: 'Running' },
        createdAt: new Date('2026-05-19T00:00:00.000Z')
      })
    ).resolves.toMatchObject({
      id: 'provider-sandbox-id',
      image: { repository: 'fallback-image', tag: 'latest' },
      status: { state: 'Running' },
      createdAt: new Date('2026-05-19T00:00:00.000Z')
    });
  });

  it('falls back when ready sandbox info is empty', async () => {
    const createdAt = new Date('2026-05-19T00:00:00.000Z');

    await expect(
      getReadySandboxInfo(createSandbox({ id: undefined }), {
        sandboxId: 'stable-session-id',
        image: { repository: 'fallback-image' },
        createdAt
      })
    ).resolves.toEqual({
      id: 'stable-session-id',
      image: { repository: 'fallback-image' },
      entrypoint: [],
      status: { state: 'Running' },
      createdAt
    });
  });

  it('returns provider sandbox info when getInfo succeeds', async () => {
    const sandboxInfo = {
      id: 'provider-id',
      image: { repository: 'provider-image' },
      entrypoint: ['sh'],
      status: { state: 'Running' },
      createdAt: new Date('2026-05-20T00:00:00.000Z')
    };

    await expect(
      getReadySandboxInfo(
        createSandbox({
          getInfo: vi.fn(async () => sandboxInfo)
        }),
        {
          sandboxId: 'stable-session-id',
          image: { repository: 'fallback-image' }
        }
      )
    ).resolves.toBe(sandboxInfo);
  });

  it('closes the connected provider when post processing fails', async () => {
    const closeMock = vi.fn(async () => undefined);
    const sandbox = createSandbox({
      provider: 'sealosdevbox',
      close: closeMock
    });
    Object.defineProperty(sandbox, 'status', {
      get() {
        throw new Error('status failed');
      }
    });
    mocks.buildSandboxAdapter.mockReturnValueOnce(sandbox);

    await expect(
      connectReadySandboxByInstance(sealosConfig, {
        sandboxId: 'sealos-post-process-fail'
      })
    ).rejects.toThrow('status failed');

    expect(closeMock).toHaveBeenCalledTimes(1);
  });
});
