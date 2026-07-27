import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackEnum } from '@fastgpt/global/common/middle/tracks/constants';

const mocks = vi.hoisted(() => ({
  shouldRecord: vi.fn(),
  trackCreate: vi.fn(),
  loggerDebug: vi.fn(),
  loggerError: vi.fn()
}));

vi.unmock('@fastgpt/service/common/middle/tracks/utils');

vi.mock('@fastgpt/dal/redis/repositories', () => ({
  createDailyActiveDedupeRepository: () => ({
    shouldRecord: mocks.shouldRecord
  })
}));

vi.mock('@fastgpt/service/common/middle/tracks/schema', () => ({
  TrackModel: {
    create: mocks.trackCreate
  }
}));

vi.mock('@fastgpt/service/common/logger', () => ({
  getLogger: () => ({
    debug: mocks.loggerDebug,
    error: mocks.loggerError
  }),
  LogCategories: {
    EVENT: {
      TRACK: ['event', 'track']
    }
  }
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: vi.fn()
}));

import { pushTrack } from '@fastgpt/service/common/middle/tracks/utils';

const dailyActiveData = {
  uid: 'user-1',
  teamId: 'team-1',
  tmbId: 'member-1'
};

describe('pushTrack.dailyUserActive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-24T23:59:59.000Z'));
    global.feConfigs = { isPlus: true } as any;
    mocks.shouldRecord.mockResolvedValue(true);
    mocks.trackCreate.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('claims the UTC date before recording the first daily active event', async () => {
    await pushTrack.dailyUserActive(dailyActiveData);

    expect(mocks.shouldRecord).toHaveBeenCalledWith({
      uid: 'user-1',
      date: '2026-07-24'
    });
    expect(mocks.trackCreate).toHaveBeenCalledWith({
      event: TrackEnum.dailyUserActive,
      uid: 'user-1',
      teamId: 'team-1',
      tmbId: 'member-1',
      data: {}
    });
  });

  it('skips Mongo tracking when another request already claimed the daily key', async () => {
    mocks.shouldRecord.mockResolvedValue(false);

    await expect(pushTrack.dailyUserActive(dailyActiveData)).resolves.toBeUndefined();

    expect(mocks.trackCreate).not.toHaveBeenCalled();
  });

  it('keeps the existing plus-edition guard after claiming the key', async () => {
    global.feConfigs = { isPlus: false } as any;

    await pushTrack.dailyUserActive(dailyActiveData);

    expect(mocks.shouldRecord).toHaveBeenCalledOnce();
    expect(mocks.trackCreate).not.toHaveBeenCalled();
  });

  it('preserves propagation of asynchronous Mongo tracking failures', async () => {
    const error = new Error('mongo unavailable');
    mocks.trackCreate.mockRejectedValue(error);

    await expect(pushTrack.dailyUserActive(dailyActiveData)).rejects.toBe(error);

    expect(mocks.loggerError).not.toHaveBeenCalled();
  });
});
