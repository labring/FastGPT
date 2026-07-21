import { describe, expect, it, vi } from 'vitest';
import {
  asRedisLogicalKey,
  createRedisLogicalKey,
  redisCapabilities
} from '@fastgpt/service/common/redis';
import { createRedisCapabilities } from '@fastgpt/service/common/redis/capability';

describe('createRedisCapabilities', () => {
  it('wires command and blocking dependencies without creating connections eagerly', async () => {
    const commandClient = {
      get: vi.fn().mockResolvedValue('value')
    };
    const blockingClient = { xread: vi.fn().mockResolvedValue(null) };
    const release = vi.fn(async () => undefined);
    const getCommandClient = vi.fn(() => commandClient as any);
    const createBlockingClient = vi.fn(() => ({ client: blockingClient as any, release }));

    const capabilities = createRedisCapabilities({ getCommandClient, createBlockingClient });

    expect(getCommandClient).not.toHaveBeenCalled();
    expect(createBlockingClient).not.toHaveBeenCalled();
    await expect(capabilities.string.get(asRedisLogicalKey('cache:test'))).resolves.toBe('value');
    await expect(
      capabilities.stream.readBlocking({
        key: asRedisLogicalKey('stream:test'),
        afterId: '$',
        blockMs: 1
      })
    ).resolves.toEqual([]);
    expect(getCommandClient).toHaveBeenCalledTimes(1);
    expect(createBlockingClient).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
    expect(Object.keys(capabilities.atomic).sort()).toEqual([
      'initializeVersion',
      'releaseLease',
      'renewLease'
    ]);
  });

  it('exposes logical key builders and resolves default dependencies lazily', async () => {
    const previousRuntime = global.redisRuntime;
    const commandClient = { get: vi.fn().mockResolvedValue('value') };
    const blockingClient = { xread: vi.fn().mockResolvedValue(null) };
    const releaseConnection = vi.fn(async () => undefined);
    const runtime = {
      getCommandConnection: vi.fn(() => commandClient),
      createBlockingConnection: vi.fn(() => blockingClient),
      releaseConnection
    };
    global.redisRuntime = runtime as unknown as NonNullable<typeof global.redisRuntime>;

    try {
      const cacheKey = createRedisLogicalKey({ namespace: 'cache', segments: ['user'] });
      const streamKey = asRedisLogicalKey('stream:test');

      await expect(redisCapabilities.string.get(cacheKey)).resolves.toBe('value');
      await expect(
        redisCapabilities.stream.readBlocking({
          key: streamKey,
          afterId: '$',
          blockMs: 1
        })
      ).resolves.toEqual([]);
      expect(commandClient.get).toHaveBeenCalledWith('fastgpt:cache:user');
      expect(runtime.createBlockingConnection).toHaveBeenCalledTimes(1);
      expect(releaseConnection).toHaveBeenCalledWith(blockingClient);
    } finally {
      global.redisRuntime = previousRuntime;
    }
  });
});
