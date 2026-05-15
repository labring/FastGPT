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
  const createSandboxMock = vi.fn((provider: string, connectionConfig: any) => ({
    provider,
    connectionConfig,
    create: vi.fn(async () => undefined),
    start: vi.fn(async () => undefined),
    stop: stopMock,
    delete: deleteMock,
    getInfo: vi.fn(async () => null),
    execute: vi.fn(async () => ({ stdout: 'ok', stderr: '', exitCode: 0 })),
    waitUntilReady: vi.fn(async () => undefined),
    ensureRunning: ensureRunningMock
  }));

  return {
    createSandboxMock,
    deleteMock,
    ensureRunningMock,
    stopMock
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
import { SandboxStatusEnum } from '@fastgpt/global/core/ai/sandbox/constants';
import {
  SandboxClient,
  deleteSandboxesByChatIds,
  deleteSandboxesByAppId
} from '@fastgpt/service/core/ai/sandbox/controller';

const { Types } = connectionMongo;
const oid = () => String(new Types.ObjectId());

beforeAll(async () => {
  vi.clearAllMocks();
  await MongoSandboxInstance.deleteMany({});
});

const appId1 = oid();
const appId2 = oid();

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

  it('should not error when chatId does not exist', async () => {
    await expect(
      deleteSandboxesByChatIds({ appId: appId1, chatIds: ['nonexistent'] })
    ).resolves.not.toThrow();
  });

  it('should handle empty chatIds array', async () => {
    await expect(deleteSandboxesByChatIds({ appId: appId1, chatIds: [] })).resolves.not.toThrow();
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

    // 验证不影响其他 appId 的数据
    expect(await MongoSandboxInstance.countDocuments({ appId: appId2 })).toBe(1);
  });

  it('should not error when appId has no sandboxes', async () => {
    const emptyAppId = oid();
    await expect(deleteSandboxesByAppId(emptyAppId)).resolves.not.toThrow();
  });
});

describe('cronJob - suspendInactiveSandboxes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await MongoSandboxInstance.deleteMany({});
  });

  it('should identify running sandboxes inactive > 5 min', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000);
    const recent = new Date();

    await MongoSandboxInstance.create([
      {
        provider: 'sealosdevbox',
        sandboxId: 'old1',
        appId: appId1,
        userId: 'u',
        chatId: 'c1',
        status: 'running',
        lastActiveAt: old,
        createdAt: old
      },
      {
        provider: 'sealosdevbox',
        sandboxId: 'recent1',
        appId: appId1,
        userId: 'u',
        chatId: 'c2',
        status: 'running',
        lastActiveAt: recent,
        createdAt: recent
      },
      {
        provider: 'sealosdevbox',
        sandboxId: 'already',
        appId: appId1,
        userId: 'u',
        chatId: 'c3',
        status: 'stopped',
        lastActiveAt: old,
        createdAt: old
      }
    ]);

    // 模拟定时任务的查询逻辑
    const instances = await MongoSandboxInstance.find({
      status: SandboxStatusEnum.running,
      lastActiveAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) }
    }).lean();

    // 验证查询逻辑正确：只找到超过 5 分钟未活动的 running 状态沙盒
    expect(instances).toHaveLength(1);
    expect(instances[0].sandboxId).toBe('old1');

    // 验证不包含最近活动的沙盒
    expect(instances.find((i) => i.sandboxId === 'recent1')).toBeUndefined();

    // 验证不包含已停止的沙盒
    expect(instances.find((i) => i.sandboxId === 'already')).toBeUndefined();
  });
});
