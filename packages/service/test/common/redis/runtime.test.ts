import { beforeEach, describe, expect, it, vi } from 'vitest';

const legacyClient = { disconnect: vi.fn() };
const commandClient = {};
const blockingClient = {};
const queueClient = {};
const workerClient = {};
const runtime = {
  getLegacyCommandConnection: vi.fn(() => legacyClient),
  getCommandConnection: vi.fn(() => commandClient),
  createBlockingConnection: vi.fn(() => blockingClient),
  createQueueConnection: vi.fn(() => queueClient),
  createWorkerConnection: vi.fn(() => workerClient),
  getConnectionSnapshot: vi.fn(() => []),
  checkHealth: vi.fn(async () => ({ latencyMs: 1 })),
  close: vi.fn(async () => undefined)
};
const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
const configureRedisRuntime = vi.fn(() => runtime);
const getConfiguredRedisRuntime = vi.fn<() => typeof runtime | undefined>(() => runtime);
const closeRedisRuntime = vi.fn(async () => undefined);

/**
 * 绕过全局测试 setup 对 service facade 的 mock，动态加载真实绑定层。
 * DAL、环境和 logger 仍保持注入，确保测试不会访问真实 Redis。
 */
const loadRedisRuntimeBinding = async () => {
  vi.resetModules();
  vi.doUnmock('@fastgpt/service/common/redis/runtime');
  vi.doMock('@fastgpt/dal/redis/runtime', () => ({
    configureRedisRuntime,
    getConfiguredRedisRuntime,
    closeRedisRuntime
  }));
  vi.doMock('@fastgpt/service/env', () => ({
    serviceEnv: { REDIS_URL: 'redis://service-redis:6379' }
  }));
  vi.doMock('@fastgpt/service/common/logger', () => ({
    getLogger: () => logger,
    LogCategories: { INFRA: { REDIS: ['infra', 'redis'] } }
  }));

  return import('@fastgpt/service/common/redis/runtime');
};

describe('service Redis Runtime binding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfiguredRedisRuntime.mockReturnValue(runtime);
    global.redisClient = null;
  });

  it('injects service configuration and the legacy hot-reload client into DAL', async () => {
    global.redisClient = legacyClient as any;
    const { getRedisRuntime } = await loadRedisRuntimeBinding();

    expect(getRedisRuntime()).toBe(runtime);
    expect(configureRedisRuntime).toHaveBeenCalledWith({
      redisUrl: 'redis://service-redis:6379',
      logger,
      existingCommandClient: legacyClient
    });
  });

  it('delegates connection helpers to the configured DAL Runtime', async () => {
    const {
      checkRedisHealth,
      createBlockingRedisConnection,
      createQueueRedisConnection,
      createWorkerRedisConnection,
      getGlobalRedisConnection,
      getPhysicalRedisConnection,
      getRedisConnectionSnapshot
    } = await loadRedisRuntimeBinding();

    expect(getGlobalRedisConnection()).toBe(legacyClient);
    expect(global.redisClient).toBe(legacyClient);
    expect(getPhysicalRedisConnection()).toBe(commandClient);
    expect(createBlockingRedisConnection()).toBe(blockingClient);
    expect(createQueueRedisConnection()).toBe(queueClient);
    expect(createWorkerRedisConnection()).toBe(workerClient);
    expect(getRedisConnectionSnapshot()).toEqual([]);
    await expect(checkRedisHealth()).resolves.toEqual({ latencyMs: 1 });
  });

  it('closes the configured DAL Runtime and clears the legacy client', async () => {
    global.redisClient = legacyClient as any;
    const { closeRedisConnections } = await loadRedisRuntimeBinding();

    await closeRedisConnections();

    expect(closeRedisRuntime).toHaveBeenCalledTimes(1);
    expect(global.redisClient).toBeNull();
  });

  it('disconnects an orphaned legacy client without configuring a Runtime', async () => {
    getConfiguredRedisRuntime.mockReturnValueOnce(undefined);
    global.redisClient = legacyClient as any;
    const { closeRedisConnections } = await loadRedisRuntimeBinding();

    await closeRedisConnections();

    expect(legacyClient.disconnect).toHaveBeenCalledTimes(1);
    expect(configureRedisRuntime).not.toHaveBeenCalled();
    expect(closeRedisRuntime).not.toHaveBeenCalled();
    expect(global.redisClient).toBeNull();
  });
});
