import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRedisStoreAdapter } from '@fastgpt/dal/redis/adapter';
import { createTeamVectorCountRepository } from '@fastgpt/dal/redis/repositories';

const logicalKey = 'cache:team_vector_count:team-1';
const physicalKey = `fastgpt:${logicalKey}`;

describe('createTeamVectorCountRepository', () => {
  const redis = {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn()
  };
  const logger = {
    warn: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    redis.get.mockResolvedValue(null);
    redis.set.mockResolvedValue(undefined);
    redis.delete.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('preserves the physical key and 1800 second TTL through the Redis adapter', async () => {
    const commandClient = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(0)
    };
    const adapter = createRedisStoreAdapter({ getCommandClient: () => commandClient as any });
    const repository = createTeamVectorCountRepository({ redis: adapter, logger });

    await expect(repository.get('team-1')).resolves.toBeUndefined();
    await repository.set({ teamId: 'team-1', count: 42 });
    await repository.invalidate('team-1');

    expect(commandClient.get).toHaveBeenCalledWith(physicalKey);
    expect(commandClient.set).toHaveBeenCalledWith(physicalKey, '42', 'PX', 1_800_000);
    expect(commandClient.del).toHaveBeenCalledWith(physicalKey);
  });

  it('returns a cached decimal string as a number', async () => {
    redis.get.mockResolvedValue('150');
    const repository = createTeamVectorCountRepository({ redis: redis as any, logger });

    await expect(repository.get('team-1')).resolves.toBe(150);
    expect(redis.get).toHaveBeenCalledWith(logicalKey);
  });

  it('returns a miss when Redis has no value', async () => {
    const repository = createTeamVectorCountRepository({ redis: redis as any, logger });

    await expect(repository.get('team-1')).resolves.toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('returns a miss and logs when a read fails', async () => {
    const error = new Error('read failed');
    redis.get.mockRejectedValue(error);
    const repository = createTeamVectorCountRepository({ redis: redis as any, logger });

    await expect(repository.get('team-1')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to get team vector count cache', {
      teamId: 'team-1',
      error
    });
  });

  it('returns a miss after the independent read deadline', async () => {
    vi.useFakeTimers();
    redis.get.mockReturnValue(new Promise(() => undefined));
    const repository = createTeamVectorCountRepository({ redis: redis as any, logger });

    const result = repository.get('team-1');
    await vi.advanceTimersByTimeAsync(3000);

    await expect(result).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to get team vector count cache', {
      teamId: 'team-1',
      error: expect.any(Error)
    });
  });

  it('writes a decimal string with the fixed TTL', async () => {
    const repository = createTeamVectorCountRepository({ redis: redis as any, logger });

    await repository.set({ teamId: 'team-1', count: 42 });

    expect(redis.set).toHaveBeenCalledWith({
      key: logicalKey,
      value: '42',
      ttlMs: 1_800_000
    });
  });

  it('logs write failures without rejecting', async () => {
    const error = new Error('write failed');
    redis.set.mockRejectedValue(error);
    const repository = createTeamVectorCountRepository({ redis: redis as any, logger });

    await expect(repository.set({ teamId: 'team-1', count: 42 })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to set team vector count cache', {
      teamId: 'team-1',
      error
    });
  });

  it('logs write timeouts without rejecting', async () => {
    vi.useFakeTimers();
    redis.set.mockReturnValue(new Promise(() => undefined));
    const repository = createTeamVectorCountRepository({ redis: redis as any, logger });

    const result = repository.set({ teamId: 'team-1', count: 42 });
    await vi.advanceTimersByTimeAsync(3000);

    await expect(result).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to set team vector count cache', {
      teamId: 'team-1',
      error: expect.any(Error)
    });
  });

  it('invalidates the cache key', async () => {
    const repository = createTeamVectorCountRepository({ redis: redis as any, logger });

    await repository.invalidate('team-1');

    expect(redis.delete).toHaveBeenCalledWith(logicalKey);
  });

  it('logs invalidate failures without rejecting', async () => {
    const error = new Error('delete failed');
    redis.delete.mockRejectedValue(error);
    const repository = createTeamVectorCountRepository({ redis: redis as any, logger });

    await expect(repository.invalidate('team-1')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to invalidate team vector count cache', {
      teamId: 'team-1',
      error
    });
  });

  it('logs invalidate timeouts without rejecting', async () => {
    vi.useFakeTimers();
    redis.delete.mockReturnValue(new Promise(() => undefined));
    const repository = createTeamVectorCountRepository({ redis: redis as any, logger });

    const result = repository.invalidate('team-1');
    await vi.advanceTimersByTimeAsync(3000);

    await expect(result).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to invalidate team vector count cache', {
      teamId: 'team-1',
      error: expect.any(Error)
    });
  });
});
