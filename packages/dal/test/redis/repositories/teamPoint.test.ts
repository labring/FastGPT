import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTeamPointRepository } from '@fastgpt/dal/redis/repositories';

describe('createTeamPointRepository', () => {
  const redis = {
    deleteMany: vi.fn(),
    getPair: vi.fn(),
    incrementWithTtl: vi.fn(),
    setPair: vi.fn()
  };
  const logger = { warn: vi.fn() };
  const repository = createTeamPointRepository({ redis, logger });

  beforeEach(() => {
    vi.clearAllMocks();
    redis.getPair.mockResolvedValue(['1500', '2000']);
    redis.setPair.mockResolvedValue(undefined);
    redis.incrementWithTtl.mockResolvedValue(1600);
    redis.deleteMany.mockResolvedValue(undefined);
  });

  it('only returns a pair when both historical keys are valid', async () => {
    await expect(repository.get('team-1')).resolves.toEqual({
      totalPoints: 2000,
      surplusPoints: 1500
    });
    expect(redis.getPair).toHaveBeenCalledWith({
      first: 'cache:team_point_surplus:team-1',
      second: 'cache:team_point_total:team-1'
    });
  });

  it.each([
    [null, '2000'],
    ['1500', null],
    ['not-a-number', '2000'],
    ['1500', 'Infinity'],
    ['', '2000']
  ])('treats partial or malformed pair %s as a cache miss', async (surplus, total) => {
    redis.getPair.mockResolvedValue([surplus, total]);

    await expect(repository.get('team-1')).resolves.toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('converts Redis read errors to a miss and records a warning', async () => {
    const error = new Error('redis down');
    redis.getPair.mockRejectedValue(error);

    await expect(repository.get('team-1')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to get team point cache', {
      teamId: 'team-1',
      error
    });
  });

  it('refreshes both keys atomically with the same 60-second TTL', async () => {
    await expect(
      repository.set({ teamId: 'team-1', totalPoints: 2000, surplusPoints: 1500 })
    ).resolves.toBeUndefined();
    expect(redis.setPair).toHaveBeenCalledWith({
      first: { key: 'cache:team_point_surplus:team-1', value: '1500' },
      second: { key: 'cache:team_point_total:team-1', value: '2000' },
      ttlMs: 60_000
    });
  });

  it('records write failures without rejecting the wallet flow', async () => {
    const error = new Error('write failed');
    redis.setPair.mockRejectedValue(error);

    await expect(
      repository.set({ teamId: 'team-1', totalPoints: 2000, surplusPoints: 1500 })
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith('Failed to set team point cache', {
      teamId: 'team-1',
      error
    });
  });

  it('increments surplus with TTL and skips zero increments', async () => {
    await expect(
      repository.incrementSurplus({ teamId: 'team-1', value: -100 })
    ).resolves.toBeUndefined();
    expect(redis.incrementWithTtl).toHaveBeenCalledWith({
      key: 'cache:team_point_surplus:team-1',
      increment: -100,
      ttlSeconds: 60
    });

    await expect(
      repository.incrementSurplus({ teamId: 'team-1', value: 0 })
    ).resolves.toBeUndefined();
    expect(redis.incrementWithTtl).toHaveBeenCalledTimes(1);
  });

  it('records increment and clear failures without rejecting', async () => {
    const incrementError = new Error('increment failed');
    const clearError = new Error('clear failed');
    redis.incrementWithTtl.mockRejectedValue(incrementError);
    redis.deleteMany.mockRejectedValue(clearError);

    await expect(
      repository.incrementSurplus({ teamId: 'team-1', value: 1 })
    ).resolves.toBeUndefined();
    await expect(repository.clear('team-1')).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenNthCalledWith(1, 'Failed to increment team point cache', {
      teamId: 'team-1',
      value: 1,
      error: incrementError
    });
    expect(logger.warn).toHaveBeenNthCalledWith(2, 'Failed to clear team point cache', {
      teamId: 'team-1',
      error: clearError
    });
  });

  it.each([
    ['totalPoints', { teamId: 'team-1', totalPoints: Number.NaN, surplusPoints: 1 }],
    [
      'surplusPoints',
      { teamId: 'team-1', totalPoints: 1, surplusPoints: Number.POSITIVE_INFINITY }
    ],
    ['value', { teamId: 'team-1', value: Number.NaN }]
  ])('skips invalid numeric input for %s', async (_field, input) => {
    const action = 'value' in input ? repository.incrementSurplus(input) : repository.set(input);

    await expect(action).resolves.toBeUndefined();
    expect(redis.setPair).not.toHaveBeenCalled();
    expect(redis.incrementWithTtl).not.toHaveBeenCalled();
  });

  it('uses the no-op logger when invalid cache input is rejected without a logger', async () => {
    const repository = createTeamPointRepository({ redis });

    await expect(
      repository.set({ teamId: 'team-1', totalPoints: Number.NaN, surplusPoints: 1 })
    ).resolves.toBeUndefined();
    expect(redis.setPair).not.toHaveBeenCalled();
  });
});
