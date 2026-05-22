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

vi.mock('@fastgpt/service/core/ai/sandbox/provider/adapter', () => ({
  buildSandboxAdapter: mocks.buildSandboxAdapter
}));

import {
  connectReadySandboxByInstance,
  connectToSandbox,
  disconnectSandbox,
  ensureConnectedSandboxRunning,
  getReadySandboxInfo
} from '@fastgpt/service/core/ai/sandbox/provider/lifecycle';

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
    expect(result.waitUntilReady).toHaveBeenCalledTimes(1);
  });

  it('does not probe getInfo before adapter ensureRunning', async () => {
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
    expect(sandbox.waitUntilReady).toHaveBeenCalledTimes(1);
    expect(sandbox.execute).toHaveBeenCalledWith('true', { timeoutMs: 5_000 });
  });

  it('waits until devbox command channel leaves pending after lifecycle ready', async () => {
    vi.useFakeTimers();
    try {
      const executeMock = vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('Command execution failed: devbox pod is not running: Pending'), {
            commandError: new Error('devbox pod is not running: Pending')
          })
        )
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      const sandbox = createSandbox({
        provider: 'sealosdevbox',
        execute: executeMock
      });
      mocks.buildSandboxAdapter.mockReturnValueOnce(sandbox);

      const connectPromise = connectToSandbox(sealosConfig, 'sandbox-pending-command');

      await vi.advanceTimersByTimeAsync(1_000);

      await expect(connectPromise).resolves.toMatchObject({ provider: 'sealosdevbox' });
      expect(executeMock).toHaveBeenCalledTimes(2);
      expect(executeMock).toHaveBeenCalledWith('true', { timeoutMs: 5_000 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries devbox command probe when exec channel times out during startup', async () => {
    vi.useFakeTimers();
    try {
      const executeMock = vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error('Command execution failed: exec command timeout'), {
            command: 'true',
            commandError: Object.assign(new Error('exec command timeout'), {
              command: 'true'
            })
          })
        )
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
      const sandbox = createSandbox({
        provider: 'sealosdevbox',
        execute: executeMock
      });
      mocks.buildSandboxAdapter.mockReturnValueOnce(sandbox);

      const connectPromise = connectToSandbox(sealosConfig, 'sandbox-timeout-command');

      await vi.advanceTimersByTimeAsync(1_000);

      await expect(connectPromise).resolves.toMatchObject({ provider: 'sealosdevbox' });
      expect(executeMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('throws immediately when command probe returns a non-retryable result', async () => {
    const sandbox = createSandbox({
      provider: 'sealosdevbox',
      execute: vi.fn(async () => ({
        stdout: '',
        stderr: 'permission denied',
        exitCode: 126
      }))
    });
    mocks.buildSandboxAdapter.mockReturnValueOnce(sandbox);

    await expect(connectToSandbox(sealosConfig, 'sandbox-non-retryable-result')).rejects.toThrow(
      'permission denied'
    );
  });

  it('uses stdout or default message when command probe exits with a non-retryable result', async () => {
    const stdoutSandbox = createSandbox({
      provider: 'sealosdevbox',
      execute: vi.fn(async () => ({
        stdout: 'stdout failure',
        stderr: '',
        exitCode: 1
      }))
    });
    mocks.buildSandboxAdapter.mockReturnValueOnce(stdoutSandbox);

    await expect(connectToSandbox(sealosConfig, 'sandbox-stdout-failure')).rejects.toThrow(
      'stdout failure'
    );

    const defaultSandbox = createSandbox({
      provider: 'sealosdevbox',
      execute: vi.fn(async () => ({
        stdout: '',
        stderr: '',
        exitCode: 1
      }))
    });
    mocks.buildSandboxAdapter.mockReturnValueOnce(defaultSandbox);

    await expect(connectToSandbox(sealosConfig, 'sandbox-default-failure')).rejects.toThrow(
      'Sandbox command probe failed'
    );
  });

  it('throws immediately when command probe throws a non-retryable error', async () => {
    const sandbox = createSandbox({
      provider: 'sealosdevbox',
      execute: vi.fn(async () => {
        throw Object.assign(new Error('wrapper failed'), {
          commandError: new Error('permission denied')
        });
      })
    });
    mocks.buildSandboxAdapter.mockReturnValueOnce(sandbox);

    await expect(connectToSandbox(sealosConfig, 'sandbox-non-retryable-error')).rejects.toThrow(
      'wrapper failed'
    );
  });

  it('throws the last retryable command probe error after retry timeout', async () => {
    vi.useFakeTimers();
    try {
      const sandbox = createSandbox({
        provider: 'sealosdevbox',
        execute: vi.fn(async () => {
          throw Object.assign(new Error('outer retryable failure'), {
            cause: new Error('exec command timeout')
          });
        })
      });
      mocks.buildSandboxAdapter.mockReturnValueOnce(sandbox);

      const connectPromise = connectToSandbox(sealosConfig, 'sandbox-retry-timeout');
      const assertion = expect(connectPromise).rejects.toThrow('outer retryable failure');

      await vi.advanceTimersByTimeAsync(120_000);

      await assertion;
      expect(sandbox.execute).toHaveBeenCalled();
      expect(mocks.logger.warn).toHaveBeenCalledWith(
        'Sandbox command channel retry exhausted',
        expect.objectContaining({
          sandboxId: 'provider-sandbox-id'
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips command probe for non-devbox providers', async () => {
    const sandbox = createSandbox({
      provider: 'opensandbox'
    });

    await ensureConnectedSandboxRunning(sandbox);

    expect(sandbox.ensureRunning).toHaveBeenCalledTimes(1);
    expect(sandbox.waitUntilReady).toHaveBeenCalledTimes(1);
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

  it('connects ready sandbox by instance even when metadata getInfo is transiently unavailable', async () => {
    const getInfoMock = vi.fn(async () => {
      throw new Error('Devbox API returned non-JSON response (503): no healthy upstream');
    });
    const sandbox = createSandbox({
      provider: 'sealosdevbox',
      getInfo: getInfoMock
    });
    mocks.buildSandboxAdapter.mockReturnValueOnce(sandbox);

    await expect(
      connectReadySandboxByInstance(sealosConfig, { sandboxId: 'stable-session-id' })
    ).resolves.toMatchObject({
      sandboxInfo: {
        id: 'provider-sandbox-id',
        status: { state: 'Running' },
        image: { repository: '' }
      }
    });

    expect(sandbox.ensureRunning).toHaveBeenCalledTimes(1);
    expect(sandbox.waitUntilReady).toHaveBeenCalledTimes(1);
    expect(getInfoMock).toHaveBeenCalledTimes(1);
  });

  it('disconnects opensandbox when connect-ready post processing fails', async () => {
    const closeMock = vi.fn(async () => undefined);
    const sandbox = createSandbox({
      provider: 'opensandbox',
      close: closeMock
    });
    Object.defineProperty(sandbox, 'status', {
      get() {
        throw new Error('status failed');
      }
    });
    mocks.buildSandboxAdapter.mockReturnValueOnce(sandbox);

    await expect(
      connectReadySandboxByInstance(opensandboxConfig, {
        sandboxId: 'opensandbox-post-process-fail'
      })
    ).rejects.toThrow('status failed');

    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('disconnects opensandbox and keeps other providers as no-op', async () => {
    const closeMock = vi.fn().mockResolvedValue(undefined);
    await disconnectSandbox({
      provider: 'opensandbox',
      close: closeMock
    } as any);
    expect(closeMock).toHaveBeenCalledTimes(1);

    await expect(
      disconnectSandbox({
        provider: 'sealosdevbox'
      } as any)
    ).resolves.toBeUndefined();
  });
});
