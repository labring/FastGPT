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
  connectToSandbox,
  disconnectSandbox,
  deleteSandboxesByChatIds,
  deleteSandboxesByAppId,
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
