import { beforeEach, describe, expect, it, vi } from 'vitest';

const queueClient = {};
const workerClient = {};
const runtime = {
  createQueueConnection: vi.fn(() => queueClient),
  createWorkerConnection: vi.fn(() => workerClient),
  checkHealth: vi.fn(async () => ({ latencyMs: 1 })),
  close: vi.fn(async () => undefined)
};
const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() };
const configureRedisRuntime = vi.fn(() => runtime);
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
  });

  it('injects service configuration into DAL', async () => {
    const { getRedisRuntime } = await loadRedisRuntimeBinding();

    expect(getRedisRuntime()).toBe(runtime);
    expect(configureRedisRuntime).toHaveBeenCalledWith({
      redisUrl: 'redis://service-redis:6379',
      logger
    });
  });

  it('delegates health checks to the configured DAL Runtime', async () => {
    const { checkRedisHealth } = await loadRedisRuntimeBinding();

    await expect(checkRedisHealth()).resolves.toEqual({ latencyMs: 1 });
  });

  it('closes the configured DAL Runtime', async () => {
    const { closeRedisConnections } = await loadRedisRuntimeBinding();

    await closeRedisConnections();

    expect(closeRedisRuntime).toHaveBeenCalledTimes(1);
  });

  it('keeps close idempotent when the DAL Runtime is not configured', async () => {
    const { closeRedisConnections } = await loadRedisRuntimeBinding();

    await closeRedisConnections();

    expect(configureRedisRuntime).not.toHaveBeenCalled();
    expect(closeRedisRuntime).toHaveBeenCalledTimes(1);
  });
});
