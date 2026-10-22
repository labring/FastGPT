import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RedisCacheAdapter } from '@fastgpt/dal/redis/adapter';
import { TeamVectorCountCache } from '@fastgpt/dal/redis/caches/teamVectorCount';

describe('TeamVectorCountCache', () => {
  const redis = { get: vi.fn(), evalScript: vi.fn() };
  const logger = { warn: vi.fn() };
  const cache = () => new TeamVectorCountCache({ redis: redis as any, logger });
  const revisionKey = 'cache:team_vector_count_revision:t';
  const countKey = 'cache:team_vector_count:t';

  beforeEach(() => {
    vi.resetAllMocks();
    redis.get.mockResolvedValue(null);
    redis.evalScript.mockResolvedValue(1);
  });
  afterEach(() => vi.useRealTimers());

  describe('get', () => {
    it('reads existing decimal counts, including zero, and treats malformed values as misses', async () => {
      for (const [raw, value] of [
        ['150', 150],
        ['0', 0],
        [null, undefined],
        [undefined, undefined],
        ['', undefined],
        [' ', undefined],
        ['-1', undefined],
        ['1.5', undefined],
        ['0x10', undefined],
        ['1e3', undefined],
        ['NaN', undefined],
        ['9007199254740992', undefined]
      ]) {
        redis.get.mockResolvedValueOnce(raw);
        await expect(cache().get('t')).resolves.toBe(value);
      }
      expect(redis.get).toHaveBeenCalledWith(countKey);
    });
  });

  describe('getRevision', () => {
    it('returns only a valid revision token', async () => {
      redis.evalScript.mockResolvedValueOnce('revision');
      await expect(cache().getRevision('t')).resolves.toBe('revision');
      expect(redis.evalScript).toHaveBeenCalledWith({
        script: expect.any(String),
        keys: [revisionKey],
        args: [expect.any(String), 1_800_000]
      });
      for (const invalid of [null, '', 1]) {
        redis.evalScript.mockResolvedValueOnce(invalid);
        await expect(cache().getRevision('t')).resolves.toBeUndefined();
      }
    });
  });

  describe('set and invalidate', () => {
    it('uses the original physical count key and a separate revision key in atomic operations', async () => {
      const commandClient = { eval: vi.fn().mockResolvedValue(1) };
      const adapter = new RedisCacheAdapter({ getCommandClient: () => commandClient as any });
      const actual = new TeamVectorCountCache({ redis: adapter, logger });
      await actual.set({ teamId: 't', count: 42, revision: 'r' });
      expect(commandClient.eval).toHaveBeenCalledWith(
        expect.any(String),
        2,
        `fastgpt:${revisionKey}`,
        `fastgpt:${countKey}`,
        'r',
        '42',
        '1800000'
      );
      await actual.invalidate('t');
      expect(commandClient.eval).toHaveBeenLastCalledWith(
        expect.any(String),
        2,
        `fastgpt:${revisionKey}`,
        `fastgpt:${countKey}`,
        expect.any(String),
        '1800000'
      );
    });
  });

  describe('best-effort Redis operations', () => {
    const operations = [
      {
        name: 'get',
        method: (c: TeamVectorCountCache) => c.get('t'),
        mock: redis.get,
        warning: 'Failed to get team vector count cache'
      },
      {
        name: 'getRevision',
        method: (c: TeamVectorCountCache) => c.getRevision('t'),
        mock: redis.evalScript,
        warning: 'Failed to get team vector count revision'
      },
      {
        name: 'set',
        method: (c: TeamVectorCountCache) => c.set({ teamId: 't', count: 5, revision: 'r' }),
        mock: redis.evalScript,
        warning: 'Failed to set team vector count cache'
      },
      {
        name: 'invalidate',
        method: (c: TeamVectorCountCache) => c.invalidate('t'),
        mock: redis.evalScript,
        warning: 'Failed to invalidate team vector count cache'
      }
    ];

    it.each(operations)(
      '$name logs failures without overriding the database result',
      async ({ method, mock, warning }) => {
        const error = new Error('offline');
        mock.mockRejectedValueOnce(error);
        await expect(method(cache())).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(warning, { teamId: 't', error });
      }
    );

    it.each(operations)(
      '$name retains an independent three-second deadline',
      async ({ method, mock, warning }) => {
        vi.useFakeTimers();
        mock.mockReturnValueOnce(new Promise(() => undefined));
        const operation = method(cache());
        await vi.advanceTimersByTimeAsync(3000);
        await expect(operation).resolves.toBeUndefined();
        expect(logger.warn).toHaveBeenCalledWith(warning, {
          teamId: 't',
          error: expect.any(Error)
        });
      }
    );
  });
});
