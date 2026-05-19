import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

// Mock the env module BEFORE any imports that use it
vi.mock('@fastgpt/service/env', () => ({
  serviceEnv: {
    AGENT_SANDBOX_PROVIDER: 'sealosdevbox',
    AGENT_SANDBOX_SEALOS_BASEURL: 'http://mock-sandbox.local',
    AGENT_SANDBOX_SEALOS_TOKEN: 'mock-token-12345',
    AGENT_SANDBOX_OPENSANDBOX_BASEURL: 'http://mock-opensandbox.local',
    AGENT_SANDBOX_OPENSANDBOX_USE_SERVER_PROXY: false,
    AGENT_SANDBOX_OPENSANDBOX_RUNTIME: 'docker',
    AGENT_SANDBOX_E2B_API_KEY: 'mock-e2b-token',
    SANDBOX_PROXY_REPLACE_DOCKER_INTERNAL_WITH_LOCALHOST: false,
    AGENT_SANDBOX_ENABLE_VOLUME: false
  }
}));

// Mock the SealosDevboxAdapter to avoid real API calls
const sandboxAdapterMocks = vi.hoisted(() => {
  const deleteMock = vi.fn(async () => undefined);
  const stopMock = vi.fn(async () => undefined);
  const ensureRunningMock = vi.fn(async () => undefined);
  const waitUntilReadyMock = vi.fn(async () => undefined);
  const createSandboxMock = vi.fn((provider: string, connectionConfig: any) => ({
    provider,
    connectionConfig,
    status: { state: 'Running' },
    create: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    stop: stopMock,
    delete: deleteMock,
    getInfo: vi.fn(async () => null),
    execute: vi.fn(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 })),
    waitUntilReady: waitUntilReadyMock,
    ensureRunning: ensureRunningMock
  }));

  return {
    createSandboxMock,
    deleteMock,
    ensureRunningMock,
    stopMock,
    waitUntilReadyMock
  };
});

vi.mock('@fastgpt-sdk/sandbox-adapter', () => {
  class MockSealosDevboxAdapter {
    async create() {
      return undefined;
    }
    async start() {
      return undefined;
    }
    async stop() {
      return undefined;
    }
    async delete() {
      return undefined;
    }
    async getInfo() {
      return null;
    }
    async execute() {
      return { stdout: 'ok', stderr: '', exitCode: 0 };
    }
    async waitUntilReady() {
      return undefined;
    }
    async ensureRunning() {
      return undefined;
    }
  }

  return {
    SealosDevboxAdapter: MockSealosDevboxAdapter,
    createSandbox: sandboxAdapterMocks.createSandboxMock
  };
});

import { connectionMongo } from '@fastgpt/service/common/mongo';
import { MongoSandboxInstance } from '@fastgpt/service/core/ai/sandbox/schema';
import {
  SandboxClient,
  connectReadySandboxByInstance,
  connectToSandbox,
  disconnectSandbox,
  deleteSandboxesByChatIds,
  deleteSandboxesByAppId,
  getSandboxCodeServerProxyTarget,
  getReadySandboxInfo,
  getSandboxClient,
  getSandboxEndpoint
} from '@fastgpt/service/core/ai/sandbox/controller';

const { Types } = connectionMongo;
const oid = () => String(new Types.ObjectId());

beforeAll(async () => {
  vi.clearAllMocks();
  await MongoSandboxInstance.deleteMany({});
});

const appId1 = oid();
const appId2 = oid();

describe('sandbox runtime helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('connects sandbox by stable sandbox id through ensureRunning', async () => {
    const result = await connectToSandbox(
      {
        provider: 'opensandbox',
        baseUrl: 'http://sandbox.local',
        apiKey: 'api-key',
        runtime: 'docker'
      },
      'sandbox-1'
    );

    expect(result.provider).toBe('opensandbox');
    expect(sandboxAdapterMocks.ensureRunningMock).toHaveBeenCalledTimes(1);
    expect(sandboxAdapterMocks.waitUntilReadyMock).toHaveBeenCalledTimes(1);
    expect((result as any).connectionConfig.sessionId).toBe('sandbox-1');
  });

  it('does not probe getInfo before adapter ensureRunning', async () => {
    const getInfoMock = vi.fn(async () => {
      throw new Error('Devbox API returned non-JSON response (503): no healthy upstream');
    });
    const ensureRunningMock = vi.fn(async () => undefined);
    const waitUntilReadyMock = vi.fn(async () => undefined);

    sandboxAdapterMocks.createSandboxMock.mockImplementationOnce(
      (provider: string, connectionConfig: any) => ({
        provider,
        connectionConfig,
        status: { state: 'Running' },
        create: vi.fn(async () => undefined),
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
        getInfo: getInfoMock,
        execute: vi.fn(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 })),
        waitUntilReady: waitUntilReadyMock,
        ensureRunning: ensureRunningMock
      })
    );

    await expect(
      connectToSandbox(
        {
          provider: 'sealosdevbox',
          baseUrl: 'http://sandbox.local',
          token: 'api-key'
        },
        'sandbox-transient-upstream'
      )
    ).resolves.toMatchObject({ provider: 'sealosdevbox' });

    expect(getInfoMock).not.toHaveBeenCalled();
    expect(ensureRunningMock).toHaveBeenCalledTimes(1);
    expect(waitUntilReadyMock).toHaveBeenCalledTimes(1);
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
      const ensureRunningMock = vi.fn(async () => undefined);
      const waitUntilReadyMock = vi.fn(async () => undefined);

      sandboxAdapterMocks.createSandboxMock.mockImplementationOnce(
        (provider: string, connectionConfig: any) => ({
          provider,
          connectionConfig,
          id: 'pending-command-sandbox',
          status: { state: 'Running' },
          create: vi.fn(async () => undefined),
          start: vi.fn(async () => undefined),
          stop: vi.fn(async () => undefined),
          delete: vi.fn(async () => undefined),
          getInfo: vi.fn(async () => null),
          execute: executeMock,
          waitUntilReady: waitUntilReadyMock,
          ensureRunning: ensureRunningMock
        })
      );

      const connectPromise = connectToSandbox(
        {
          provider: 'sealosdevbox',
          baseUrl: 'http://sandbox.local',
          token: 'api-key'
        },
        'sandbox-pending-command'
      );

      await vi.advanceTimersByTimeAsync(1_000);

      await expect(connectPromise).resolves.toMatchObject({ provider: 'sealosdevbox' });
      expect(ensureRunningMock).toHaveBeenCalledTimes(1);
      expect(waitUntilReadyMock).toHaveBeenCalledTimes(1);
      expect(executeMock).toHaveBeenCalledTimes(2);
      expect(executeMock).toHaveBeenCalledWith('true', { timeoutMs: 5_000 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits while devbox exec reports pod is not running with a non-pending phase', async () => {
    vi.useFakeTimers();
    try {
      const executeMock = vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(
            new Error('Command execution failed: devbox pod is not running: Succeeded'),
            {
              commandError: new Error('devbox pod is not running: Succeeded')
            }
          )
        )
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      sandboxAdapterMocks.createSandboxMock.mockImplementationOnce(
        (provider: string, connectionConfig: any) => ({
          provider,
          connectionConfig,
          id: 'succeeded-command-sandbox',
          status: { state: 'Running' },
          create: vi.fn(async () => undefined),
          start: vi.fn(async () => undefined),
          stop: vi.fn(async () => undefined),
          delete: vi.fn(async () => undefined),
          getInfo: vi.fn(async () => null),
          execute: executeMock,
          waitUntilReady: vi.fn(async () => undefined),
          ensureRunning: vi.fn(async () => undefined)
        })
      );

      const connectPromise = connectToSandbox(
        {
          provider: 'sealosdevbox',
          baseUrl: 'http://sandbox.local',
          token: 'api-key'
        },
        'sandbox-succeeded-command'
      );

      await vi.advanceTimersByTimeAsync(1_000);

      await expect(connectPromise).resolves.toMatchObject({ provider: 'sealosdevbox' });
      expect(executeMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back when reading ready sandbox info fails after availability check', async () => {
    const sandbox = {
      provider: 'sealosdevbox',
      id: 'provider-sandbox-id',
      status: { state: 'Running' },
      getInfo: vi.fn(async () => {
        throw new Error('Devbox API returned non-JSON response (503): no healthy upstream');
      })
    } as any;

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

  it('connects ready sandbox by instance even when metadata getInfo is transiently unavailable', async () => {
    const getInfoMock = vi.fn(async () => {
      throw new Error('Devbox API returned non-JSON response (503): no healthy upstream');
    });
    const ensureRunningMock = vi.fn(async () => undefined);
    const waitUntilReadyMock = vi.fn(async () => undefined);

    sandboxAdapterMocks.createSandboxMock.mockImplementationOnce(
      (provider: string, connectionConfig: any) => ({
        provider,
        connectionConfig,
        id: 'provider-sandbox-id',
        status: { state: 'Running' },
        create: vi.fn(async () => undefined),
        start: vi.fn(async () => undefined),
        stop: vi.fn(async () => undefined),
        delete: vi.fn(async () => undefined),
        getInfo: getInfoMock,
        execute: vi.fn(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 })),
        waitUntilReady: waitUntilReadyMock,
        ensureRunning: ensureRunningMock
      })
    );

    await expect(
      connectReadySandboxByInstance(
        {
          provider: 'sealosdevbox',
          baseUrl: 'http://sandbox.local',
          token: 'api-key'
        },
        { sandboxId: 'stable-session-id' }
      )
    ).resolves.toMatchObject({
      sandboxInfo: {
        id: 'provider-sandbox-id',
        status: { state: 'Running' },
        image: { repository: '' }
      }
    });

    expect(ensureRunningMock).toHaveBeenCalledTimes(1);
    expect(waitUntilReadyMock).toHaveBeenCalledTimes(1);
    expect(getInfoMock).toHaveBeenCalledTimes(1);
  });

  it('waits until sandbox command channel is ready after ensureAvailable', async () => {
    const client = await getSandboxClient({ sandboxId: 'sandbox-ready-check' });

    expect(client.provider.provider).toBe('sealosdevbox');
    expect(sandboxAdapterMocks.ensureRunningMock).toHaveBeenCalledTimes(1);
    expect(sandboxAdapterMocks.waitUntilReadyMock).toHaveBeenCalledTimes(1);
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

  it('throws when endpoint capability is unavailable on current provider', async () => {
    await expect(
      getSandboxEndpoint({
        provider: 'sealosdevbox'
      } as any)
    ).rejects.toThrow('does not expose endpoint capability');
  });

  it('uses a stable endpoint hash as sandbox proxy revision', async () => {
    await expect(
      getSandboxEndpoint({
        provider: 'sealosdevbox',
        getEndpoint: vi.fn(async () => ({
          host: 'gateway.example.com',
          port: 443,
          protocol: 'https',
          url: 'https://gateway.example.com/code-server/devbox-new'
        }))
      } as any)
    ).resolves.toEqual({
      host: 'gateway.example.com',
      port: 443,
      protocol: 'https',
      url: 'https://gateway.example.com/code-server/devbox-new',
      proxyRevision: 'ef0ea93d2c1b7b60'
    });
  });

  it('retries transient provider failures while resolving endpoint', async () => {
    vi.useFakeTimers();
    const getEndpointMock = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(
          new Error('Devbox API returned non-JSON response (503): no healthy upstream'),
          {
            status: 503,
            rawBody: 'no healthy upstream'
          }
        )
      )
      .mockResolvedValueOnce({
        host: 'gateway.example.com',
        port: 443,
        protocol: 'https',
        url: 'https://gateway.example.com/code-server/devbox-retry'
      });

    const endpointPromise = getSandboxEndpoint({
      provider: 'sealosdevbox',
      getEndpoint: getEndpointMock
    } as any);

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(endpointPromise).resolves.toMatchObject({
      url: 'https://gateway.example.com/code-server/devbox-retry'
    });
    expect(getEndpointMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('retries transient provider failures while resolving proxy target', async () => {
    vi.useFakeTimers();
    const getProxyTargetMock = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(
          new Error('Devbox API returned non-JSON response (503): no healthy upstream'),
          {
            status: 503,
            rawBody: 'no healthy upstream'
          }
        )
      )
      .mockResolvedValueOnce({
        service: 'code-server',
        origin: 'https://gateway.example.com',
        basePath: '/code-server/devbox-retry',
        auth: 'code-server'
      });

    const targetPromise = getSandboxCodeServerProxyTarget({
      provider: 'sealosdevbox',
      getProxyTarget: getProxyTargetMock
    } as any);

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(targetPromise).resolves.toMatchObject({
      origin: 'https://gateway.example.com',
      basePath: '/code-server/devbox-retry'
    });
    expect(getProxyTargetMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('deleteSandboxesByChatIds', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await MongoSandboxInstance.deleteMany({});
    await MongoSandboxInstance.create([
      {
        provider: 'sealosdevbox',
        sandboxId: 'sb1',
        appId: appId1,
        userId: 'u1',
        chatId: 'c1',
        status: 'running',
        lastActiveAt: new Date(),
        createdAt: new Date()
      },
      {
        provider: 'sealosdevbox',
        sandboxId: 'sb2',
        appId: appId1,
        userId: 'u1',
        chatId: 'c2',
        status: 'running',
        lastActiveAt: new Date(),
        createdAt: new Date()
      },
      {
        provider: 'sealosdevbox',
        sandboxId: 'sb3',
        appId: appId2,
        userId: 'u1',
        chatId: 'c3',
        status: 'running',
        lastActiveAt: new Date(),
        createdAt: new Date()
      }
    ]);
  });

  it('should call delete for specified chatIds', async () => {
    const countBefore = await MongoSandboxInstance.countDocuments({ appId: appId1 });
    expect(countBefore).toBe(2);

    await deleteSandboxesByChatIds({ appId: appId1, chatIds: ['c1', 'c2'] });

    expect(await MongoSandboxInstance.countDocuments({ appId: appId1 })).toBe(0);
    expect(sandboxAdapterMocks.deleteMock).toHaveBeenCalledTimes(2);
    // 验证不影响其他 appId 的数据
    expect(await MongoSandboxInstance.countDocuments({ appId: appId2 })).toBe(1);
  });

  it('should delete opensandbox resource by stable sandbox id', async () => {
    await MongoSandboxInstance.deleteMany({});
    await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'stable-session-id',
      appId: appId1,
      userId: 'u1',
      chatId: 'c-provider',
      status: 'running',
      lastActiveAt: new Date(),
      createdAt: new Date()
    });

    await deleteSandboxesByChatIds({ appId: appId1, chatIds: ['c-provider'] });

    expect(sandboxAdapterMocks.createSandboxMock).toHaveBeenCalledWith(
      'opensandbox',
      expect.objectContaining({
        sessionId: 'stable-session-id'
      }),
      undefined
    );
    expect(sandboxAdapterMocks.deleteMock).toHaveBeenCalledWith();
    expect(sandboxAdapterMocks.ensureRunningMock).not.toHaveBeenCalled();
    expect(await MongoSandboxInstance.countDocuments({ sandboxId: 'stable-session-id' })).toBe(0);
  });

  it('should stop opensandbox resource by stable sandbox id', async () => {
    const doc = await MongoSandboxInstance.create({
      provider: 'opensandbox',
      sandboxId: 'stable-session-id',
      appId: appId1,
      userId: 'u1',
      chatId: 'c-provider',
      status: 'running',
      lastActiveAt: new Date(),
      createdAt: new Date()
    });

    await SandboxClient.stopResource(doc.toObject());

    expect(sandboxAdapterMocks.createSandboxMock).toHaveBeenCalledWith(
      'opensandbox',
      expect.objectContaining({
        sessionId: 'stable-session-id'
      }),
      undefined
    );
    expect(sandboxAdapterMocks.stopMock).toHaveBeenCalledWith();
    expect(sandboxAdapterMocks.ensureRunningMock).not.toHaveBeenCalled();
    expect(
      await MongoSandboxInstance.findOne({ sandboxId: 'stable-session-id' }).lean()
    ).toMatchObject({ status: 'stopped' });
  });
});

describe('deleteSandboxesByAppId', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await MongoSandboxInstance.deleteMany({});
    await MongoSandboxInstance.create([
      {
        provider: 'sealosdevbox',
        sandboxId: 'sb1',
        appId: appId1,
        userId: 'u1',
        chatId: 'c1',
        status: 'running',
        lastActiveAt: new Date(),
        createdAt: new Date()
      },
      {
        provider: 'sealosdevbox',
        sandboxId: 'sb2',
        appId: appId1,
        userId: 'u1',
        chatId: 'c2',
        status: 'stopped',
        lastActiveAt: new Date(),
        createdAt: new Date()
      },
      {
        provider: 'sealosdevbox',
        sandboxId: 'sb3',
        appId: appId2,
        userId: 'u1',
        chatId: 'c3',
        status: 'running',
        lastActiveAt: new Date(),
        createdAt: new Date()
      }
    ]);
  });

  it('should call delete for all sandboxes under appId', async () => {
    const countBefore = await MongoSandboxInstance.countDocuments({ appId: appId1 });
    expect(countBefore).toBe(2);

    await deleteSandboxesByAppId(appId1);

    expect(await MongoSandboxInstance.countDocuments({ appId: appId1 })).toBe(0);
    expect(sandboxAdapterMocks.deleteMock).toHaveBeenCalledTimes(2);
    // 验证不影响其他 appId 的数据
    expect(await MongoSandboxInstance.countDocuments({ appId: appId2 })).toBe(1);
  });
});
