import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisCapabilities } from '@fastgpt/service/common/redis/capability';
import { createTeamVectorCountStore } from '@fastgpt/service/common/redis/stores';

const logicalKey = 'cache:team_vector_count:team-1';
const physicalKey = `fastgpt:${logicalKey}`;

describe('createTeamVectorCountStore', () => {
  const stringStore = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  };
  const logger = {
    warn: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    stringStore.get.mockResolvedValue(null);
    stringStore.set.mockResolvedValue(undefined);
    stringStore.delete.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves the physical key and 1800 second TTL through the string capability', async () => {
    const commandClient = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(0)
    };
    const capabilities = createRedisCapabilities({
      getCommandClient: () => commandClient as any,
      createBlockingClient: vi.fn() as any
    });
    const cache = createTeamVectorCountStore({ stringStore: capabilities.string, logger });

    await expect(cache.get('team-1')).resolves.toBeUndefined();
    await cache.set({ teamId: 'team-1', count: 42 });
    await cache.invalidate('team-1');

    expect(commandClient.get).toHaveBeenCalledWith(physicalKey);
    expect(commandClient.set).toHaveBeenCalledWith(physicalKey, '42', 'PX', 1_800_000);
    expect(commandClient.del).toHaveBeenCalledWith(physicalKey);
  });

  it('returns a cached decimal string as a number', async () => {
    stringStore.get.mockResolvedValue('150');
    const cache = createTeamVectorCountStore({ stringStore: stringStore as any, logger });

    await expect(cache.get('team-1')).resolves.toBe(150);
    expect(stringStore.get).toHaveBeenCalledWith(logicalKey);
  });

  it('returns a miss when Redis has no value', async () => {
    const cache = createTeamVectorCountStore({ stringStore: stringStore as any, logger });

    await expect(cache.get('team-1')).resolves.toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns a miss and logs when a read fails', async () => {
    const error = new Error('read failed');
    stringStore.get.mockRejectedValue(error);
    const cache = createTeamVectorCountStore({ stringStore: stringStore as any, logger });

    await expect(cache.get('team-1')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to get team vector count cache', {
      teamId: 'team-1',
      error
    });
  });

  it('returns a miss after the independent read deadline', async () => {
    vi.useFakeTimers();
    stringStore.get.mockReturnValue(new Promise(() => undefined));
    const cache = createTeamVectorCountStore({ stringStore: stringStore as any, logger });

    const result = cache.get('team-1');
    await vi.advanceTimersByTimeAsync(3000);

    await expect(result).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to get team vector count cache', {
      teamId: 'team-1',
      error: expect.any(Error)
    });
  });

  it('writes a decimal string with the fixed TTL', async () => {
    const cache = createTeamVectorCountStore({ stringStore: stringStore as any, logger });

    await cache.set({ teamId: 'team-1', count: 42 });

    expect(stringStore.set).toHaveBeenCalledWith({
      key: logicalKey,
      value: '42',
      ttlMs: 1_800_000
    });
  });

  it('logs write failures without rejecting', async () => {
    const error = new Error('write failed');
    stringStore.set.mockRejectedValue(error);
    const cache = createTeamVectorCountStore({ stringStore: stringStore as any, logger });

    await expect(cache.set({ teamId: 'team-1', count: 42 })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to set team vector count cache', {
      teamId: 'team-1',
      error
    });
  });

  it('logs write timeouts without rejecting', async () => {
    vi.useFakeTimers();
    stringStore.set.mockReturnValue(new Promise(() => undefined));
    const cache = createTeamVectorCountStore({ stringStore: stringStore as any, logger });

    const result = cache.set({ teamId: 'team-1', count: 42 });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(result).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to set team vector count cache', {
      teamId: 'team-1',
      error: expect.any(Error)
    });
  });

  it('invalidates the cache key', async () => {
    const cache = createTeamVectorCountStore({ stringStore: stringStore as any, logger });

    await cache.invalidate('team-1');

    expect(stringStore.delete).toHaveBeenCalledWith(logicalKey);
  });

  it('logs invalidate failures without rejecting', async () => {
    const error = new Error('delete failed');
    stringStore.delete.mockRejectedValue(error);
    const cache = createTeamVectorCountStore({ stringStore: stringStore as any, logger });

    await expect(cache.invalidate('team-1')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to invalidate team vector count cache', {
      teamId: 'team-1',
      error
    });
  });

  it('logs invalidate timeouts without rejecting', async () => {
    vi.useFakeTimers();
    stringStore.delete.mockReturnValue(new Promise(() => undefined));
    const cache = createTeamVectorCountStore({ stringStore: stringStore as any, logger });

    const result = cache.invalidate('team-1');
    await vi.advanceTimersByTimeAsync(3000);

    await expect(result).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to invalidate team vector count cache', {
      teamId: 'team-1',
      error: expect.any(Error)
    });
  });
});
