import { beforeEach, describe, expect, it, vi } from 'vitest';
import { asRedisLogicalKey, RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { SESSION_TTL_SECONDS, SessionCache } from '@fastgpt/dal/redis/caches';

const createKeyBatches = async function* (batches: string[][]) {
  for (const batch of batches) yield batch.map(asRedisLogicalKey);
};

describe('SessionCache', () => {
  const logger = {
    error: vi.fn(),
    warn: vi.fn()
  };
  const redis = {
    delete: vi.fn(),
    deleteMany: vi.fn(),
    getHashAll: vi.fn(),
    iterateByPrefix: vi.fn(),
    setHashWithTtl: vi.fn(),
    updateHashFields: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    redis.delete.mockResolvedValue(false);
    redis.deleteMany.mockResolvedValue(undefined);
    redis.getHashAll.mockResolvedValue({
      userId: 'user-1',
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: '0',
      createdAt: '1000',
      ip: '127.0.0.1'
    });
    redis.iterateByPrefix.mockReturnValue(createKeyBatches([]));
    redis.setHashWithTtl.mockResolvedValue(undefined);
    redis.updateHashFields.mockResolvedValue(undefined);
  });

  it('decodes a complete session hash and normalizes isRoot/createdAt', async () => {
    const cache = new SessionCache({ redis: redis as any, logger });

    await expect(cache.get('user-1:token-1')).resolves.toEqual({
      userId: 'user-1',
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: false,
      createdAt: 1000,
      ip: '127.0.0.1'
    });
    expect(redis.getHashAll).toHaveBeenCalledWith('session:user-1:token-1');
  });

  it('treats an empty hash as a session miss without deletion', async () => {
    redis.getHashAll.mockResolvedValue({});
    const cache = new SessionCache({ redis: redis as any, logger });

    await expect(cache.get('user-1:token-1')).resolves.toBeUndefined();
    expect(redis.delete).not.toHaveBeenCalled();
  });

  it('deletes malformed hashes and returns a miss', async () => {
    redis.getHashAll.mockResolvedValue({
      userId: 'user-1',
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: 'invalid',
      createdAt: 'not-a-number'
    });
    const cache = new SessionCache({ redis: redis as any, logger });

    await expect(cache.get('user-1:token-1')).resolves.toBeUndefined();
    expect(redis.delete).toHaveBeenCalledWith('session:user-1:token-1');
    expect(logger.error).toHaveBeenCalledWith(
      'Invalid Redis session record',
      expect.objectContaining({ sessionId: 'user-1:token-1' })
    );
  });

  it('keeps malformed-record cleanup best-effort when deletion fails', async () => {
    redis.getHashAll.mockResolvedValue({ userId: 'user-1' });
    const deleteError = new Error('delete failed');
    redis.delete.mockRejectedValue(deleteError);
    const cache = new SessionCache({ redis: redis as any, logger });

    await expect(cache.get('user-1:token-1')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to delete invalid Redis session record',
      expect.objectContaining({ sessionId: 'user-1:token-1', error: deleteError })
    );
  });

  it('propagates Redis read errors to keep authentication fail-closed', async () => {
    const error = new Error('read failed');
    redis.getHashAll.mockRejectedValue(error);
    const cache = new SessionCache({ redis: redis as any, logger });

    await expect(cache.get('user-1:token-1')).rejects.toBe(error);
  });

  it('writes the historical hash fields with a seven-day TTL', async () => {
    const cache = new SessionCache({ redis: redis as any, logger });

    await cache.set({
      sessionId: 'user-1:token-1',
      data: {
        userId: 'user-1',
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: true,
        createdAt: 2000,
        ip: null
      }
    });

    expect(redis.setHashWithTtl).toHaveBeenCalledWith({
      key: 'session:user-1:token-1',
      fields: {
        userId: 'user-1',
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: '1',
        createdAt: '2000'
      },
      ttlSeconds: SESSION_TTL_SECONDS
    });
  });

  it('preserves a non-null session IP in the hash fields', async () => {
    const cache = new SessionCache({ redis: redis as any, logger });

    await cache.set({
      sessionId: 'user-1:token-1',
      data: {
        userId: 'user-1',
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: false,
        createdAt: 2000,
        ip: '192.0.2.10'
      }
    });

    expect(redis.setHashWithTtl).toHaveBeenCalledWith({
      key: 'session:user-1:token-1',
      fields: {
        userId: 'user-1',
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: '0',
        createdAt: '2000',
        ip: '192.0.2.10'
      },
      ttlSeconds: SESSION_TTL_SECONDS
    });
  });

  it('rejects invalid session data before touching Redis', async () => {
    const cache = new SessionCache({ redis: redis as any, logger });

    await expect(
      cache.set({
        sessionId: 'user-1:token-1',
        data: {
          userId: '',
          teamId: 'team-1',
          tmbId: 'tmb-1',
          isRoot: false,
          createdAt: 2000
        }
      })
    ).rejects.toMatchObject({
      code: 'REDIS_INVALID_ARGUMENT',
      operation: 'session.set'
    });
    expect(redis.setHashWithTtl).not.toHaveBeenCalled();
  });

  it('deletes one session and maps batch IDs to logical keys', async () => {
    const cache = new SessionCache({ redis: redis as any, logger });

    await cache.delete('user-1:token-1');
    await cache.deleteMany([]);
    await cache.deleteMany(['user-1:token-2', 'user-1:token-3']);

    expect(redis.delete).toHaveBeenCalledWith('session:user-1:token-1');
    expect(redis.deleteMany).toHaveBeenCalledWith([
      'session:user-1:token-2',
      'session:user-1:token-3'
    ]);
  });

  it('updates only the team context so the existing TTL is preserved', async () => {
    const cache = new SessionCache({ redis: redis as any, logger });

    await cache.updateTeam({
      sessionId: 'user-1:token-1',
      teamId: 'team-2',
      tmbId: 'tmb-2'
    });

    expect(redis.updateHashFields).toHaveBeenCalledWith({
      key: 'session:user-1:token-1',
      fields: { teamId: 'team-2', tmbId: 'tmb-2' }
    });
    expect(redis.setHashWithTtl).not.toHaveBeenCalled();
  });

  it('scans all user pages and returns only valid typed sessions', async () => {
    redis.iterateByPrefix.mockReturnValue(
      createKeyBatches([
        ['session:user-1:token-1', 'session:user-1:token-2'],
        ['session:user-1:token-3']
      ])
    );
    redis.getHashAll
      .mockResolvedValueOnce({
        userId: 'user-1',
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: '0',
        createdAt: '1000'
      })
      .mockResolvedValueOnce({ userId: 'user-1' })
      .mockResolvedValueOnce({
        userId: 'user-1',
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: '1',
        createdAt: '3000'
      });
    const cache = new SessionCache({ redis: redis as any, logger });

    await expect(cache.listByUser('user-1')).resolves.toEqual([
      {
        sessionId: 'user-1:token-1',
        data: {
          userId: 'user-1',
          teamId: 'team-1',
          tmbId: 'tmb-1',
          isRoot: false,
          createdAt: 1000
        }
      },
      {
        sessionId: 'user-1:token-3',
        data: {
          userId: 'user-1',
          teamId: 'team-1',
          tmbId: 'tmb-1',
          isRoot: true,
          createdAt: 3000
        }
      }
    ]);
    expect(redis.iterateByPrefix).toHaveBeenCalledWith({ prefix: 'session:user-1' });
    expect(redis.delete).toHaveBeenCalledWith('session:user-1:token-2');
  });
});

describe('SessionCache adapter integration', () => {
  it('uses physical keys and one transaction for hash write and expiry', async () => {
    const commandClient = {
      del: vi.fn().mockResolvedValue(0),
      get: vi.fn(),
      hgetall: vi.fn().mockResolvedValue({
        userId: 'user-1',
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: '0',
        createdAt: '1000'
      }),
      hmset: vi.fn().mockResolvedValue('OK'),
      multi: vi.fn(),
      scan: vi.fn(),
      set: vi.fn()
    };
    const multi = {
      hmset: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([
        [null, 'OK'],
        [null, 1]
      ])
    };
    commandClient.multi.mockReturnValue(multi);
    const adapter = new RedisCacheAdapter({ getCommandClient: () => commandClient as any });
    const cache = new SessionCache({
      redis: adapter,
      logger: { error: vi.fn(), warn: vi.fn() }
    });

    await expect(cache.get('user-1:token-1')).resolves.toMatchObject({ userId: 'user-1' });
    await cache.set({
      sessionId: 'user-1:token-1',
      data: {
        userId: 'user-1',
        teamId: 'team-1',
        tmbId: 'tmb-1',
        isRoot: false,
        createdAt: 1000
      }
    });
    await cache.updateTeam({
      sessionId: 'user-1:token-1',
      teamId: 'team-2',
      tmbId: 'tmb-2'
    });

    expect(commandClient.hgetall).toHaveBeenCalledWith('fastgpt:session:user-1:token-1');
    expect(multi.hmset).toHaveBeenCalledWith('fastgpt:session:user-1:token-1', {
      userId: 'user-1',
      teamId: 'team-1',
      tmbId: 'tmb-1',
      isRoot: '0',
      createdAt: '1000'
    });
    expect(multi.expire).toHaveBeenCalledWith(
      'fastgpt:session:user-1:token-1',
      SESSION_TTL_SECONDS
    );
    expect(commandClient.hmset).toHaveBeenCalledWith('fastgpt:session:user-1:token-1', {
      teamId: 'team-2',
      tmbId: 'tmb-2'
    });
  });
});
